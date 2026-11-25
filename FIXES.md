# Pothub 0.11.4 Google sign-in fix
- Root cause: `src/firebase.ts` created Auth with `initializeAuth()` and no `popupRedirectResolver`. Unlike `getAuth()`, it does not add one, so in the browser `signInWithRedirect()` and `getRedirectResult()` threw `auth/argument-error` and Google sign-in never started. The resolver (`browserPopupRedirectResolver`) is now passed on web; the Android WebView still gets none.
- Sign-in that returns without a user (cancelled, or Back from Google) no longer leaves the app loading for 45 s; it clears the pending flag and shows the signed-out page.
- Added readable messages for `auth/argument-error` and `auth/web-storage-unsupported`.
- Still required in Firebase/Google Cloud (not code): `pothub-self.vercel.app` under Authentication > Authorized domains, and `https://pothub-self.vercel.app/__/auth/handler` as an authorized redirect URI on the web OAuth client. The `/__/auth` rewrite in vercel.json is already correct.
- Not run here: `npm install`, `npm run build`, `npm test` (no network).

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

## Durable engineering agent + remote completion notifications

- Engineering-agent plan/implement/review requests now use the durable server worker when `VITE_API_URL` is configured, except project ZIP requests that must remain local for sandbox/patch delivery.
- Agent intermediate stages are kept private; only the reviewed final stage is returned to the job status endpoint.
- The server can run API + worker together via `cd server && npm install && npm start` on a persistent host. This is not a Vercel serverless function; a long-lived host must run it.
- Remote FCM completion notifications are wired to opted-in web/PWA and Android tokens. Add `VITE_FIREBASE_VAPID_KEY` to the frontend build environment for web push. Firebase Admin credentials must be configured on the server. Android builds must run `npm install && npx cap sync android` after the Push Notifications plugin is added.
- Full build and closed-app push delivery are not verified in this environment because dependencies were unavailable.
