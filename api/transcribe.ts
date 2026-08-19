import type { VercelRequest, VercelResponse } from '@vercel/node';

const CHATGPT_TRANSCRIBE_URL = 'https://chatgpt.com/backend-api/transcribe';

export const config = { api: { bodyParser: false } };

const firstHeader = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authorization = firstHeader(req.headers.authorization);
  const accountId = firstHeader(req.headers['chatgpt-account-id']);
  if (!authorization?.startsWith('Bearer ') || !accountId) {
    return res.status(401).json({ error: 'Authentification ChatGPT requise.' });
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) return res.status(400).json({ error: 'Fichier audio vide.' });

    const contentType = firstHeader(req.headers['content-type']) || 'audio/wav';
    const filename = (firstHeader(req.headers['x-audio-filename']) || 'chunk.wav').replace(/[\r\n"]/g, '');
    const language = firstHeader(req.headers['x-transcription-language']);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: contentType }), filename);
    if (language === 'fr' || language === 'en') form.append('language', language);

    const headers: Record<string, string> = {
      Authorization: authorization,
      'ChatGPT-Account-Id': accountId,
      originator: 'Codex Desktop',
      'User-Agent': 'MeetingMind/1.0',
    };
    const fedRamp = firstHeader(req.headers['x-openai-fedramp']);
    if (fedRamp === 'true') headers['X-OpenAI-Fedramp'] = 'true';

    const upstream = await fetch(CHATGPT_TRANSCRIBE_URL, {
      method: 'POST',
      headers,
      body: form,
    });
    const raw = await upstream.text();
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Erreur de transcription ChatGPT : ${raw.slice(0, 1200)}` });

    const data = JSON.parse(raw) as { text?: string };
    return res.status(200).json({ text: data.text || '' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erreur de transcription : ' + (err?.message || 'inconnue') });
  }
}
