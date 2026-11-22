# Pothub 0.11.2 build fix and code capacity
- Build: added the missing `chevron-down` and `external-link` icons used by `src/ui/Sources.tsx` (TS2322 on Vercel). `src/ui/Icon.test.ts` now fails if any `<Icon name>` is not in the icon set.
- Code capacity: code and ZIP jobs now ask for a long reply (Anthropic 32,000 tokens, Gemini 32,768; OpenAI-style providers keep their large defaults). Anthropic's general default rose from 8,192 to 16,384.
- Code prompt: models now re-check imports, typed string values (icons, variants, routes) and cross-file references before finishing, and work in dependency order.
- Not run here: `npm install`, `npm run build`, `npm test` (no network). Run them before deploying.

# Pothub continuity and GitHub artifact commit
- Generated artifacts now persist in IndexedDB across chat reloads and can be recovered/downloaded from the message card.
- Continuity prompts can retrieve recent relevant chats and locally saved generated artifact text for correction without re-upload.
- Generated file cards now include a GitHub commit picker: select repository, branch, message and commit extracted text files.
- GitHub OAuth token is retained for the current browser session and Codelab auto-reconnects; OAuth state expiry is extended to 30 minutes.
- Binary ZIP contents are skipped by the GitHub text API commit flow; this workflow is not a replacement for Git LFS.
- Run `npm install`, `npm run build`, and `npm test` before deploying. Dependency install could not be completed in this environment.
