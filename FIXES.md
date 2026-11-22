# Pothub 0.11.3 GitHub, backend variables and site tag
- GitHub: Connect GitHub no longer needs a Pothub sign-in (that is what showed "Your sign-in session has expired" to guests). GitHub's own login/account picker opens (`prompt=select_account`). The sign-in is checked against a state value kept in this browser tab.
- Disconnect now revokes Pothub's whole authorization on GitHub (`POST /api/github/oauth/revoke`, uses GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET), so connecting again starts at GitHub's login/authorize page. Personal access tokens are only forgotten here and the notice says how to delete them.
- Backend variables: the fixed POTHUB_* list and the "Copy variable names" button are gone. You type the names of the variables you made, and "Add another set of variables" connects several providers or keys on one backend. The names travel with each connection; the server reads only plain names and refuses platform ones (VERCEL_, GITHUB_, FIREBASE_ ...). Empty names keep the old defaults, so existing backends still work.
- Site tag: "Preparing your tag…" no longer hangs. Guests get a tag (browser-made id), signed-in people keep theirs, a failure shows its reason with a Try again button, and the app waits for the saved Google sign-in to be restored before deciding someone is signed out.
- `gateway-reference.ts` was a copy of `gatewayRef.ts`; it now re-exports it.
- Not run here: `npm install`, `npm run build`, `npm test`. Server logic was exercised directly in Node.

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
