# Firebase / Firestore setup

Pothub uses Firebase Admin + Cloud Firestore for server-side account profiles, credit ledgers, payment orders and one-time native sign-in tickets. The browser Firebase SDK is used for Google sign-in in the browser. Native Android sign-in uses the system browser and server ticket exchange.

## Server-only variables
- `FIREBASE_SERVICE_ACCOUNT_JSON`: complete service-account JSON as a server-only environment variable, or use application-default credentials.
- `FIREBASE_PROJECT_ID`: optional when inferred from the service account.

Never put service-account credentials in `VITE_*` variables or frontend files. The Firebase web API key is public client configuration, not an Admin credential.

## Firestore (Spark-compatible)
1. Enable Cloud Firestore in Native mode.
2. Deploy `firestore.rules` and `firestore.indexes.json` using Firebase CLI. Rules deny direct client access; server routes use Firebase Admin. Video results are streamed through the Pothub API and are not stored in Firebase Storage.
6. Verify the server can create a profile, grant a starter-credit ledger entry, create an idempotent checkout order, and consume a one-time native ticket.

## Google browser sign-in
Enable **Authentication → Sign-in method → Google** in Firebase Console and add the exact deployed browser host to **Authentication → Settings → Authorized domains**. Configure `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID` for the web build. Browser sign-in uses Firebase redirect; the server verifies the ID token and provisions the Google profile/credit ledger.

## GitHub sign-in
Configure `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, and `APP_URL`. The GitHub OAuth app callback URL must match `${APP_URL}/api/auth/github/callback`. The flow uses state + PKCE. Native sign-in returns through `ai.pothub.app://auth?ticket=...`; tickets are single-use.

## Security checks
- Keep Firestore client rules closed; do not loosen them for convenience.
- Ensure server/proxy logs never capture POST bodies containing BYO provider keys or payment payloads.
- Test duplicate Flutterwave webhooks and payment references to verify grants remain idempotent.
