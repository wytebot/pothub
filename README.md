# Pothub

Pothub is a compact React 18 + Vite PWA with a shared Capacitor Android code path. The Vercel-hosted Express API is retained for authentication, GitHub operations, provider proxying, video jobs, credit accounting, and Flutterwave v4 payment verification.

## Project map
- `src/ui/` — welcome, role selection, Developer/Creator workspaces, agents, history, backup, profile and responsive styling.
- `src/lib/` — Dexie persistence, agent-key encryption, backup ZIP support, video adapter, biometric gate, and browser/native platform adapter.
- `src/lib/video-adapters/` — provider-specific asynchronous video operations; Gemini Omni Flash is implemented first.
- `design/` — source design assets and visual references.
- `server/` — Express API, auth/session handling, GitHub operations, AI proxy, credit ledger and payment routes.
- `api/` — Vercel entrypoints forwarding API requests to Express.
- `public/` — PWA shell, service worker, manifest, and app icons.
- Video results stream through the Vercel API; Firebase Storage is not required.
- `android-template/` — custom Android Downloads/MediaStore plugin source copied into the generated Capacitor project.
- `scripts/` — Android deep-link/plugin setup and release audit.
- `tests/` — static contract, billing safety, API safety and backup ZIP tests.
- `docs/` — setup, pricing, compatibility and manual device-test guidance.

## Local development
1. Install Node.js 20+ and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env` if present and configure the required server variables in `ENVIRONMENT_VARIABLES.md`.
4. Run `npm run dev` for the Vite UI or `npm run dev:api` for the Express API.
5. Run `npm run check` for syntax/source audit and automated tests.
6. Build the web app with `npm run build`.
7. For Android, run `npx cap add android` once, then `npm run android:configure`, `npm run cap:sync`, and build from Android Studio.

## Browser GitHub OAuth
- The Developer sign-in action navigates to the same-origin `/api/auth/github` endpoint. The server redirects the browser to `https://github.com/login/oauth/authorize`; it is not a Firebase GitHub provider flow.
- Register the exact callback `https://YOUR-VERCEL-DOMAIN/api/auth/github/callback` in the GitHub OAuth App. Keep `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and a random `SESSION_SECRET` of at least 32 characters in Vercel server-side environment variables. These cannot safely be embedded in frontend code.
- Firebase Web SDK settings are embedded in `src/lib/firebase.js`; no `VITE_FIREBASE_*` variables are required for the browser Firebase configuration. Firebase Admin credentials used for account/credit storage remain server-side and must still be configured.

## Authentication and security
- GitHub accounts use the GitHub OAuth authorization-code flow with state + PKCE and an HTTP-only session cookie in browsers. Native Android uses a one-time deep-link ticket exchanged with the API.
- Creator accounts use Firebase Google redirect in browsers and system-browser Google OAuth in the APK. The server provisions the Google profile and starter credit ledger.
- Native session tokens and the AES key used for agent secrets are stored through Android Keystore-backed secure storage. Browser agent secrets are AES-GCM encrypted with a non-extractable WebCrypto key in IndexedDB.
- Optional device verification is scoped to the API & Agents page only. It is off by default and does not gate app launch, sign-in, or other screens.
- API keys are sent in the request body only for the operation that uses them. Configure hosting/proxy logs to avoid capturing request bodies.

## Important release status
Automated tests and source audits pass in the supplied environment. A production Vite build and Android APK could not be verified because npm dependency installation timed out. Do not publish until dependencies install, `npm run build` succeeds, `npx cap sync android` completes, and the manual tests in `docs/DEVICE_TEST.md` pass with real OAuth, Google, GitHub and Flutterwave sandbox credentials.

### Optional Vercel logs connection

Developer users connect through Vercel OAuth, choose a project and deployment, and load available deployment events directly into Diagnose. OAuth tokens are held in Pothub's signed HttpOnly session and refreshed server-side. The connection is read-only and does not deploy, promote, or change Vercel projects. See `ENVIRONMENT_VARIABLES.md` for the exact callback URL and supported existing OAuth variable names.


### Vercel log connection

The Developer workspace has a single **Connect Vercel** button. It redirects the user to Vercel OAuth, then returns to Pothub after approval. Configure the existing server-side `VERCEL_CLIENT_ID` / `VERCEL_CLIENT_SECRET` credentials (or the supported OAuth aliases) and register `APP_URL/api/vercel/callback` as the exact callback URL. No access-token paste field is shown; access and refresh tokens remain in the signed HttpOnly session and refresh on the server.


For exact variable retrieval steps and the distinction between Vercel API tokens and OAuth client credentials, see [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md).
