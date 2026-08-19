<p align="center">
  <img src="assets/meeting-minutes-banner.svg" alt="Meeting Minutes" width="100%" />
</p>

# meeting-minutes

Isolated experiment derived from `benclawbot/Video-Meeting-Minutes-Manager` so changes can be tested without modifying the original application.

## Current implementation

- MP4 video input is explicitly accepted.
- M4A audio input is explicitly accepted.
- Browser-side FFmpeg extracts the first audio track and produces 16 kHz WAV chunks.
- No provider API key is used.
- The hosted UI never receives, stores, or forwards the Codex/ChatGPT OAuth bearer token.
- A loopback companion at `127.0.0.1` owns Codex OAuth credentials and refreshes them locally.
- The companion first probes the public OpenAI transcription endpoint with the Codex OAuth bearer and `gpt-4o-mini-transcribe`.
- If that OAuth probe is rejected or otherwise fails, the companion falls back locally to ChatGPT's private `/backend-api/transcribe` route. That private route is never called by the hosted Site.
- Meeting-minutes generation is also performed by the local companion through the ChatGPT Codex Responses backend, fixed by default to `gpt-5.6-sol` with `medium` reasoning effort.
- Generated minutes enforce an H1 title in the form `Meeting title — DD.MM.YYYY`.
- DOCX filenames use `Meeting title - DD.MM.YYYY.docx`.
- The date displayed in the application uses `DD.MM.YYYY` as well.

## Strict OAuth-only architecture

```text
Hosted Site / Vite UI
        |
        | HTTP to loopback only; no OAuth token
        v
127.0.0.1:43117 local companion
        |
        | reads/refreshes Codex OAuth locally
        v
~/.codex/auth.json
        |
        +--> first transcription attempt
        |    POST https://api.openai.com/v1/audio/transcriptions
        |    model=gpt-4o-mini-transcribe
        |
        +--> local fallback only if the probe fails
        |    POST https://chatgpt.com/backend-api/transcribe
        |
        +--> minutes generation
             POST https://chatgpt.com/backend-api/codex/responses
```

The public transcription probe is intentionally experimental: OpenAI does not document Codex OAuth as a supported authentication mechanism for the public audio transcription API. A successful probe is cached for the running companion process. If it fails, only the local companion may use the private ChatGPT transcription route.

## Local companion

Requirements:

- Node.js 20.10 or newer.
- Codex CLI installed and available as `codex`.
- A ChatGPT login managed by Codex.
- File-backed Codex credentials in `$CODEX_HOME/auth.json` (normally `~/.codex/auth.json`).

Start the companion:

```bash
npm install
npm run companion:start
```

By default it listens only on:

```text
http://127.0.0.1:43117
```

It does not bind to the LAN interface.

If no usable Codex ChatGPT login is found, the Site's connect button asks the companion to start `codex login`. The login process runs locally and uses Codex's own OAuth flow.

### Codex credential storage

The companion deliberately does not extract secrets from a browser session or hosted server. It reads the same `auth.json` structure used by Codex and implements Codex-compatible refresh-token rotation locally.

If Codex is configured to keep CLI credentials only in the OS keyring, switch Codex to file-backed storage and log in again before using this experiment:

```toml
cli_auth_credentials_store = "file"
```

The companion uses compare-before-write behavior when refreshing rotated tokens so it does not overwrite a newer token written concurrently by Codex.

## Site pairing

A random website must not be able to use the local OAuth companion. Therefore the companion allows only loopback development origins initially.

For a hosted Site:

1. Open the Site while the companion is running.
2. Click the ChatGPT/Codex connection button.
3. The companion opens a local pairing page showing the exact Site origin.
4. Approve that origin locally.
5. Return to the Site and connect.

Approved origins are stored locally in:

```text
~/.meeting-minutes-companion/allowed-origins.json
```

No OAuth bearer is returned during pairing.

## Action routing

| Action | Route | Where credentials live |
| --- | --- | --- |
| Public transcription probe | `https://api.openai.com/v1/audio/transcriptions` | Local companion only |
| Experimental transcription fallback | `https://chatgpt.com/backend-api/transcribe` | Local companion only |
| Meeting minutes | `https://chatgpt.com/backend-api/codex/responses` | Local companion only |
| Hosted Site | `http://127.0.0.1:43117/*` | No OAuth bearer |

## Configuration

The hosted UI only needs the loopback address, which is not secret:

```env
VITE_MEETING_MINUTES_COMPANION_URL=http://127.0.0.1:43117
```

Optional local companion overrides:

```bash
MEETING_MINUTES_COMPANION_PORT=43117
MEETING_MINUTES_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
MEETING_MINUTES_MODEL=gpt-5.6-sol
MEETING_MINUTES_REASONING_EFFORT=medium
CODEX_HOME=/path/to/.codex
```

## Development

Run the local OAuth companion in one terminal:

```bash
npm run companion:start
```

Run the UI in another:

```bash
npm run dev
```

Validation:

```bash
npm run companion:check
npm run lint
npm run build
```

No OpenAI, Groq, MiniMax, or other provider API key is required for this strict OAuth-only experiment.
