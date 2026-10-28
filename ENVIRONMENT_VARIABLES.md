# Pothub environment variables

The runtime has eight intended required Vercel variables. Firebase client SDK configuration is not used: the browser calls the same-origin API, and privileged Firestore access stays server-side through Firebase Admin. Do not add Firebase web config or any secret with a `VITE_` prefix.

## Required Vercel variables (8)

| Variable | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin service-account JSON, stored as a server-only Vercel secret. |
| `SESSION_SECRET` | At least 32 random characters; seals sessions and encrypts stored Vercel OAuth tokens. Changing it invalidates sessions and makes previously encrypted tokens unreadable. |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID. |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret. |
| `GEMINI_API_KEY` | One or more comma-separated Gemini API keys. Keys are tried in order. |
| `FLW_CLIENT_ID` | Flutterwave v4 client ID. |
| `FLW_CLIENT_SECRET` | Flutterwave v4 client secret. |
| `FLW_ENCRYPTION_KEY` | Flutterwave card-field encryption key, exposed to the browser only through `/api/billing/config` when billing is configured. |

`FIREBASE_PROJECT_ID` is derived from the service-account JSON. `APP_URL` should be set to the canonical HTTPS production origin; if absent, the server uses Vercel's deployment hostname and then the configured product default. OAuth/payment redirects never use an arbitrary request Host header. `FLW_MODE` defaults to sandbox unless explicitly set to `production`.

## Optional integrations

| Variable | Purpose |
|---|---|
| `APP_URL` | Canonical HTTPS origin for OAuth and payment returns. Recommended for production. |
| `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET` | Enable Vercel OAuth; otherwise manual token entry remains the available path. |
| `VERCEL_REDIRECT_URI` | Exact Vercel OAuth callback override; derived from canonical origin when omitted. |
| `AI_FALLBACK_BASE_URL`, `AI_FALLBACK_API_KEY`, `AI_FALLBACK_MODEL` | Optional OpenAI-compatible fallback. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional Web Push delivery. |
| `VITE_API_BASE_URL` | Public frontend build-time API URL only when API and UI are hosted separately. Usually omit. |
| `VITE_NGN_PER_USD` | Optional display-only naira estimate; never used for charging. |
| `FLW_MODE` | `sandbox` or `production`; set production only after sandbox verification. |
| `GEMINI_MODEL`, `GEMINI_MODEL_1`, `GEMINI_MODEL_2`, etc. | Optional model overrides. Defaults to `gemini-2.5-flash`. |
| `AI_MAX_PROMPT_CHARS`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_OPERATION_COST_USD` | Optional AI limits; safe code defaults are used when absent. |

## Local setup

1. Copy `.env.example` to `.env` and populate the eight required values for the flows you intend to test.
2. Create a Firebase service account in Firebase Console and paste its JSON as one line into `FIREBASE_SERVICE_ACCOUNT_JSON`. Never commit it.
3. Set GitHub OAuth callback to `https://YOUR_DOMAIN/api/auth/github/callback`. Set `APP_URL` to `https://YOUR_DOMAIN`.
4. Keep Flutterwave in sandbox until card authentication, verification, duplicate webhook and refund scenarios are tested.
5. Deploy `firestore.rules` and `firestore.indexes.json` using Firebase CLI. All direct client Firestore access is denied; the server uses Admin SDK.
6. Deploy to Vercel and call `/api/health`. It returns `200` only when all eight required environment values are present and Firebase Admin initialized; it does not prove live provider credentials are valid.

## Important limitations

- Creator Google sign-in is not end-to-end; API authorization currently requires the GitHub session.
- Video generation is not implemented.
- The Flutterwave integration is direct card charge, not hosted checkout; have the payment and PCI implications reviewed before production.
- Firestore Emulator, live OAuth, Flutterwave, Gemini image generation, Vercel deployment and Android device behavior are not verified by this repository-only audit.

### Flutterwave webhook verification

`FLW_WEBHOOK_SECRET_HASH` is optional only if you do not enable webhooks. If configured, set it to the exact webhook secret hash in the Flutterwave dashboard. The webhook endpoint fails closed with HTTP 503 until configured and rejects mismatched `verif-hash` headers. Payment verification initiated by the signed-in user remains a separate flow.


## Firebase GitHub sign-in (browser)

Set the four `VITE_FIREBASE_*` values from Firebase Console → Project settings → Your apps (web app). In Firebase Authentication, enable the GitHub provider and configure its OAuth client ID/secret; authorize the Firebase `authDomain` callback in the GitHub OAuth app. Request the `repo`, `read:user`, and `user:email` scopes so Pothub can list and inspect repositories. These VITE values are public Firebase web-app configuration, not service-account secrets. Keep `FIREBASE_SERVICE_ACCOUNT_JSON` server-only. The server verifies the Firebase ID token and separately validates the GitHub access token against GitHub before creating the existing secure Pothub session. The existing browser OAuth path remains as a fallback when Firebase web config is absent; native APK login still uses the existing browser handoff until the Capacitor Firebase credential handoff is implemented.


## Optional API environment Secret mode

Secret mode is disabled by default, so the first visit does not show a biometric gate. Users can enable it in the “Use your agent” API-key panel. The standalone Capacitor Android build uses the device biometric prompt through `@capgo/capacitor-native-biometric`; browser mode uses WebAuthn platform-authenticator prompts and requires HTTPS plus a supported authenticator. No additional Vercel environment variables are required.

Important: this is a local privacy gate around the API-key settings UI, not server-side secret storage or a cryptographic vault. API keys entered into the BYO-agent panel remain in session storage for the active session; do not use this feature as protection against malicious scripts, developer tools, or a compromised device. For production-grade key protection, keep provider keys server-side.
