# meeting-minutes

Isolated experiment derived from `benclawbot/Video-Meeting-Minutes-Manager` so changes can be tested without modifying the original application.

## Current experiment baseline

- MP4 video input is explicitly accepted.
- M4A audio input is explicitly accepted.
- Browser-side FFmpeg extracts the first audio track and produces 16 kHz WAV chunks for transcription.
- The provider badge and provider-specific status wording have been removed from the interface.
- Generated minutes enforce an H1 title in the form `Meeting title — DD.MM.YYYY`.
- DOCX filenames use `Meeting title - DD.MM.YYYY.docx`.
- The date displayed in the application uses `DD.MM.YYYY` as well.

## ChatGPT OAuth constraint

The target architecture is to use the user's ChatGPT account for both transcription and summarization. As of the current OpenAI documentation, **Sign in with ChatGPT is an identity-provider flow and does not itself provide model/API tokens or ChatGPT subscription billing to an arbitrary standalone web application**. Because of that, this repository keeps the existing server-side inference adapters as a runnable baseline while the ChatGPT-native/plugin path is evaluated. The UI is intentionally provider-neutral so those adapters can be replaced without another interface migration.

Do not treat the current MiniMax/Groq server adapters as the intended final authentication architecture.
