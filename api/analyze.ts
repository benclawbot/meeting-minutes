import type { VercelRequest, VercelResponse } from '@vercel/node';

const MINIMAX_BASE_URL = 'https://api.minimaxi.chat/v1';
const MINIMAX_MODEL = 'minimax-m2.5';

interface AnalyzeBody { title: string; date: string; transcript: string; locale?: 'fr' | 'en'; }

const formatDocumentDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const minimaxKey = process.env.MINIMAX_API_KEY || process.env.VITE_MINIMAX_API_KEY;
  if (!minimaxKey) return res.status(500).json({ error: 'Clé API de génération manquante.' });
  const body = req.body as AnalyzeBody | undefined;
  if (!body?.transcript?.trim()) return res.status(400).json({ error: 'Transcript manquant.' });

  const { title, date, transcript } = body;
  const formattedDate = formatDocumentDate(date);
  const documentTitle = `${title} — ${formattedDate}`;
  const locale = body.locale === 'en' ? 'en' : 'fr';
  const isFr = locale === 'fr';
  const lang = isFr ? 'français' : 'English';
  const summary = isFr ? 'Résumé exécutif' : 'Executive summary';
  const participants = 'Participants';
  const discussion = isFr ? 'Points clés discutés' : 'Key discussion points';
  const decisions = isFr ? 'Décisions prises' : 'Decisions made';
  const actions = isFr ? 'Actions à mener' : 'Action items';
  const next = isFr ? 'Prochaine réunion' : 'Next meeting';
  const action = 'Action';
  const owner = isFr ? 'Responsable' : 'Owner';
  const due = isFr ? 'Échéance' : 'Due date';
  const priority = isFr ? 'Priorité' : 'Priority';
  const status = isFr ? 'Statut' : 'Status';
  const confirm = isFr ? 'À confirmer' : 'To confirm';

  const prompt = `
Génère un compte rendu professionnel en ${lang} pour la réunion "${title}" du ${formattedDate}.
Le document doit commencer par exactement : # ${documentTitle}
N'ajoute pas type de réunion, organisateur, rédacteur, lieu, lien ni pied de page.
Structure le contenu avec des puces détaillées et concrètes.
Utilise exclusivement la langue demandée.

Format Markdown attendu :
# ${documentTitle}

## ${summary}
Un court paragraphe, puis 4 à 6 puces couvrant objectif, état actuel, risques, décisions et prochaines étapes.

## ${participants}
- Liste les participants identifiables, sinon ${confirm}.

## ${discussion}
### 1. Sujet principal
- 2 à 4 puces avec contexte, détails, contraintes ou désaccords.
### 2. Sujet principal
- 2 à 4 puces.
### 3. Sujet principal
- 2 à 4 puces.

## ${decisions}
- Décisions avec justification, impact ou dépendance.

## ${actions}
| ${action} | ${owner} | ${due} | ${priority} | ${status} |
| :--- | :--- | :--- | :--- | :--- |

## ${next}
- Date et heure si mentionnées, sinon ${confirm}.
- Puces d'ordre du jour suggérées.

TRANSCRIPTION :
${transcript}
`.trim();

  try {
    const aiRes = await fetch(`${MINIMAX_BASE_URL}/text/chatcompletion_v2`, { method: 'POST', headers: { Authorization: `Bearer ${minimaxKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MINIMAX_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 6144 }) });
    if (!aiRes.ok) return res.status(aiRes.status).json({ error: `Erreur de génération : ${await aiRes.text()}` });
    const data = await aiRes.json() as { choices?: Array<{ message?: { content?: string } }> };
    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/^```markdown\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').replace(/[\u0400-\u04FF]+/g, '').replace(/[\u4E00-\u9FFF]+/g, '');
    const firstTitleIndex = text.search(/^#\s+/m);
    if (firstTitleIndex > 0) text = text.substring(firstTitleIndex).trim();
    if (/^#\s+.*$/m.test(text)) text = text.replace(/^#\s+.*$/m, `# ${documentTitle}`);
    else text = `# ${documentTitle}\n\n${text}`;
    if (!text.trim()) return res.status(500).json({ error: 'Aucun contenu généré.' });
    return res.status(200).json({ minutes: text, usage: { input_tokens: Math.ceil(prompt.length / 4), output_tokens: Math.ceil(text.length / 4) } });
  } catch (err: any) { return res.status(500).json({ error: 'Erreur de génération : ' + (err?.message || 'inconnue') }); }
}
