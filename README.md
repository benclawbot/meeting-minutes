# meeting-minutes

Isolated experiment derived from `benclawbot/Video-Meeting-Minutes-Manager` so changes can be tested without modifying the original application.

## Current implementation

- MP4 video input is explicitly accepted.
- M4A audio input is explicitly accepted.
- Browser-side FFmpeg extracts the first audio track and produces 16 kHz WAV chunks.
- The user authenticates with ChatGPT OAuth. No provider API key or model selector is exposed.
- The maintained `@openai-oauth/react` client persists the signed-in session in encrypted browser storage and refreshes it when needed, so actions reuse the same login until the user disconnects or the authorization can no longer be refreshed.
- Transcription is routed automatically to ChatGPT's authenticated transcription action.
- Meeting-minutes generation is fixed to `gpt-5.6-sol` with `medium` reasoning effort.
- Provider badges and provider-specific status wording have been removed from the interface.
- Generated minutes enforce an H1 title in the form `Meeting title — DD.MM.YYYY`.
- DOCX filenames use `Meeting title - DD.MM.YYYY.docx`.
- The date displayed in the application uses `DD.MM.YYYY` as well.

## OAuth flow

The hosted web flow uses the open-source ChatGPT OAuth browser handoff supplied by `@openai-oauth/react`. On desktop Chrome or Firefox, the Sign in with ChatGPT browser extension is required to securely return the OAuth authorization code to the hosted application. Browser model requests are sent to same-origin serverless routes with the authenticated session headers.

No ChatGPT access token is committed to the repository or stored in server environment variables.

## Action routing

| Action | Route |
| --- | --- |
| Audio transcription | `https://chatgpt.com/backend-api/transcribe` with the authenticated ChatGPT session |
| Meeting minutes | ChatGPT Codex Responses backend using `gpt-5.6-sol`, reasoning effort `medium` |

The transcription endpoint is an internal ChatGPT/Codex endpoint rather than a public OpenAI API contract. It may change independently of this repository; failures are surfaced to the user instead of silently falling back to another provider.

## Development

```bash
npm install
npm run lint
npm run build
```

No provider API keys are required for the ChatGPT OAuth path.
