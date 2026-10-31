# Pothub

Pothub is a React 18 + Next.js application for browser deployment on Vercel, with a separate static-export build for Capacitor Android. The Express API is routed through a Next.js API catch-all on Vercel and remains responsible for authentication, GitHub operations, provider proxying, video jobs, credit accounting, and Flutterwave v4 payment verification.

## Project map
- `src/ui/` — welcome, role selection, Developer/Creator workspaces, agents, history, backup, profile and responsive styling.
- `src/lib/` — Dexie persistence, account-partitioned local cache, cloud sync, agent-key encryption, backup ZIP support, video adapter, biometric gate, and browser/native platform adapter.
- `src/lib/video-adapters/` — provider-specific asynchronous video operations; Gemini Omni Flash is implemented first.
- `design/` — source design assets and visual references.
- `server/` — Express API, auth/session handling, GitHub operations, AI proxy, credit ledger and payment routes.
- `pages/api/[...path].js` — Next.js API catch-all forwarding `/api/*` requests to Express.
- `public/` — PWA shell, service worker, manifest, and app icons.
- Video results stream through the Vercel API; Firebase Storage is not required.
- `android-template/` — custom Android Downloads/MediaStore plugin source copied into the generated Capacitor project.
- `scripts/` — Android deep-link/plugin setup and release audit.
- `tests/` — static contract, billing safety, API safety and backup ZIP tests.
- `docs/` — setup, pricing, compatibility and manual device-test guidance.

## Framework and deployment updates
- Vercel must use a normal Next.js server build (do not set `output: export` or set the Vercel Output Directory to `out`). The API catch-all and UI deploy together. `npm run build:cap` temporarily switches to static export, removes the API route only during that build, and restores source files afterward.
- Set `NEXT_PUBLIC_API_BASE` only when the API is hosted on a different origin; it must be the API origin without a trailing `/api`. For same-origin browser deployment, leave it blank. For APK builds, set it to the deployed API origin before building.
- Each build stamps the service worker and its cache name. Existing users get a refresh popup when a newer deployed worker is detected.

## Local development
1. Install Node.js 20+ and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env` if present and configure the required server variables in `ENVIRONMENT_VARIABLES.md`.
4. Run `npm run dev` for the Next.js UI or `npm run dev:api` for the Express API.
5. Run `npm run check` for syntax/source audit and automated tests.
6. Build the Vercel web app with `npm run build` (normal Next.js build; output is not a static `out/` folder).
7. For Android, run `npx cap add android` once, then `npm run android:configure`, `npm run cap:sync`, and build from Android Studio. The Capacitor command uses the separate static export script.

## Browser GitHub OAuth
- The Developer sign-in action navigates to the same-origin `/api/auth/github` endpoint. The server redirects the browser to `https://github.com/login/oauth/authorize`; it is not a Firebase GitHub provider flow.
- Register the exact callback `https://YOUR-VERCEL-DOMAIN/api/auth/github/callback` in the GitHub OAuth App. Keep `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and a random `SESSION_SECRET` of at least 32 characters in Vercel server-side environment variables. These cannot safely be embedded in frontend code.
- Firebase Web SDK settings are embedded in `src/lib/firebase.js`; no Vite-prefixed Firebase variables are required for the browser Firebase configuration. Firebase Admin credentials used for account/credit storage remain server-side and must still be configured.

## Authentication and security
- GitHub accounts use the GitHub OAuth authorization-code flow with state + PKCE and an HTTP-only session cookie in browsers. Native Android uses a one-time deep-link ticket exchanged with the API.
- Creator accounts use Firebase Google popup in browsers (with redirect fallback when popups are blocked) and system-browser Google OAuth in the APK. The server verifies the Firebase ID token, provisions the Google profile and starter credit ledger, and establishes an HTTP-only session cookie.
- Native session tokens and the AES key used for agent secrets are stored through Android Keystore-backed secure storage. Browser agent secrets are AES-GCM encrypted with a non-extractable WebCrypto key in IndexedDB.
- Optional device verification is scoped to the API & Agents page only. It is off by default and does not gate app launch, sign-in, or other screens. Browser WebAuthn/PIN state is account-scoped; native biometric/PIN state is stored in Android secure storage. Native biometric enrollment always establishes a passcode fallback first.
- API keys are sent in the request body only for the operation that uses them. Configure hosting/proxy logs to avoid capturing request bodies.

## Important release status
The static release audit and JavaScript/JSX syntax checks pass. The full test suite is not fully executable in this workspace because `express`, `firebase-admin`, and `typescript` are not installed; 64 tests passed and 16 dependency-backed suites could not start (80 total tests). A production Next.js build and Android APK were not verified. Do not publish until dependencies install, `npm test` passes, `npm run build` succeeds, `npm run build:cap` succeeds, and the manual tests in `docs/DEVICE_TEST.md` pass with real OAuth, Google, GitHub and Flutterwave sandbox credentials.

### Deployment platform

Vercel remains Pothub's hosting and deployment platform. The Developer workspace reads repositories and GitHub Actions directly from GitHub. Pothub does not connect to Vercel through a separate OAuth app, so no Vercel OAuth callback/redirect URL or Vercel OAuth client credentials are required.

## Latest integration build

This build adds Runway, Luma, Kling and Replicate video adapters; Firestore-backed resumable media jobs; cross-instance provider health; server-verified browser WebAuthn/PIN lock; searchable model selection; and lazy workspace/history chunks. See `CHANGELOG.md`, `AUDIT_REPORT.md` and `FINAL_VERIFICATION_REPORT.md`.

**Release gate:** automated checks pass, but production and Capacitor builds still require dependency installation in a network-enabled environment. Live payment/OAuth/provider checks and physical Android testing are not certified by this source-only verification. See `FINAL_VERIFICATION_REPORT.md` before deployment.


### Persistent workspace storage

PotHub keeps a durable local IndexedDB workspace and automatically synchronizes saved agents, chats, prompts, runs, projects, and metadata to the signed-in account. Local rows are partitioned per account when switching users so offline changes are preserved instead of cleared. Configure `POTHUB_VAULT_ENCRYPTION_KEY` as a stable server-only Vercel environment variable to enable encrypted API-key sync. Binary media blobs remain local and are transferable through the ZIP backup. HTML pages are network-only; only immutable static assets are cached by the service worker.
