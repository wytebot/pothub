# Firebase / Firestore setup

Pothub now uses Firebase Admin + Cloud Firestore for server-side persistent data. The browser SDK in `src/lib/firebase.js` initializes the public Firebase app configuration, but trusted account, billing, credit-ledger, notification and encrypted Vercel-token operations run through the Express API using Firebase Admin.

## Vercel variables
- `FIREBASE_SERVICE_ACCOUNT_JSON`: complete service-account JSON as a single server-only environment variable.
- `FIREBASE_PROJECT_ID`: optional when project ID is present in the service-account JSON; otherwise set it to the Firebase project ID.

Do not put the service-account JSON in any `VITE_` variable or frontend file. The Firebase web API key is public client configuration, not an Admin credential.

## Firestore
1. Enable Cloud Firestore in Native mode in the Firebase project.
2. Deploy `firestore.rules` and `firestore.indexes.json` using Firebase CLI.
3. Confirm server health reports the database integration ready.
4. Test account creation, credit reservation/refund, repeated payment verification, notification delivery and Vercel token storage in a non-production project.

Client rules deny all direct reads/writes; server routes use Firebase Admin. Do not loosen the rules for convenience.

## Pothub sign-in gate (Google or GitHub)

The app now renders only a sign-in/loading screen until a server GitHub session or Firebase Google user is restored. Configure the frontend build variables `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`. In Firebase Console, enable **Authentication → Sign-in method → Google** and add the exact deployed web host to **Authentication → Settings → Authorized domains**. The configured Firebase `authDomain` must resolve and be reachable over HTTPS. Google redirect sign-in returns to the same app URL; test it on the deployed domain, not only a local preview.

GitHub sign-in uses the backend OAuth redirect endpoint (`/api/auth/github`) rather than relying on a popup. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and a strong `SESSION_SECRET` on the backend. Set the GitHub OAuth app callback URL to the backend's exact `/api/auth/github/callback` URL. For the standalone APK, set `VITE_API_BASE_URL` to the HTTPS backend origin (without `/api`) and register the `ai.pothub.app` deep link used by the native handoff.

Google sign-in authenticates the frontend Firebase identity and unlocks the workspace UI. Repository access and GitHub write operations still require GitHub authorization; a Google identity does not grant GitHub repository scopes. Production account/credit APIs must explicitly support Google identities before treating a Google-only login as a fully provisioned server billing account.
