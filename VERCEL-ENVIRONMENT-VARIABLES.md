# Pothub Vercel environment variables

Configure these as **server-side** Vercel Project Environment Variables. Do not prefix secrets with `VITE_`. The Firebase web SDK configuration is already embedded in `src/firebase.ts`; it does not require `VITE_FIREBASE_*` variables.

## Required for the current hosted application

| Variable | Purpose |
|---|---|
| `APP_ORIGIN` | Exact HTTPS origin of the deployed Pothub app, e.g. `https://pothub-self.vercel.app` |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin service-account JSON (or supported base64 JSON) used to verify Firebase ID tokens and access Firestore |
| `GITHUB_CLIENT_ID` | GitHub OAuth application client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret and signed-state secret |
| `GITHUB_CALLBACK_URL` | Full HTTPS URL ending `/api/github/oauth/callback` |
| `VERCEL_CLIENT_ID` | Vercel OAuth application client ID |
| `VERCEL_CLIENT_SECRET` | Vercel OAuth application client secret |
| `DOCTOR_WEBHOOK_SECRET` | Long random secret shared with the opted-in GitHub Actions callback workflow |

## Billing

| Variable | Purpose |
|---|---|
| `FLW_SECRET_KEY` | Flutterwave secret key |
| `FLW_WEBHOOK_HASH` | Flutterwave webhook signing hash |
| `PREMIUM_CURRENCY` | Three-letter currency code; defaults to USD |
| `PRO_MONTHLY_AMOUNT` | Pro monthly price; defaults to 5.99 |
| `PRO_PLUS_MONTHLY_AMOUNT` | Pro+ monthly price; defaults to 9.99 |

## Optional

- `SITE_VERIFY_SECRET` for site verification (falls back to GitHub client secret).
- `EXTRA_ORIGINS` for explicitly permitted additional app origins.
- `POTHUB_PROVIDER`, `POTHUB_API_KEY`, `POTHUB_MODEL`, `POTHUB_ALLOWED_EMAILS` for the optional server-side provider proxy. BYOK credentials configured by a user remain under their selected provider's account.

## Vercel OAuth callback

Register this exact callback URL in the Vercel OAuth app: `https://YOUR-POTHUB-DOMAIN/api/vercel/oauth/callback`. Enable the `openid`, `email`, `profile`, and `offline_access` scopes in the Vercel app settings. Pothub uses authorization code + PKCE (S256), validates the state and nonce, and requests refresh tokens through `offline_access`. Tokens are encrypted before Firestore storage and are not returned to the browser. Each user sees projects accessible to their own Vercel authorization.

Do **not** configure `VERCEL_TOKEN`, `VERCEL_PROJECT_IDS`, or `VERCEL_TEAM_ID`; the per-user OAuth flow replaces the shared token and project allowlist. Do not configure `VITE_FIREBASE_*`; Firebase client configuration is public app metadata embedded in the client. Never expose service-account JSON, OAuth client secrets, Flutterwave secrets, or webhook secrets to the browser.
