# Pothub environment variables and setup

## 1. Browser build variables (Vercel → Project → Settings → Environment Variables)

Set these for **Production** and any Preview environment you intend to test:

- `VITE_FIREBASE_API_KEY` — Firebase Console → Project settings → General → Your apps → Web app config → `apiKey`.
- `VITE_FIREBASE_AUTH_DOMAIN` — same web config → `authDomain` (usually `<project-id>.firebaseapp.com`).
- `VITE_FIREBASE_PROJECT_ID` — same web config → `projectId`.
- `VITE_FIREBASE_APP_ID` — same web config → `appId`.
- `VITE_API_BASE` — optional. Leave blank when frontend and API are served from the same Vercel domain. If the API is on a separate domain, use only its origin, e.g. `https://your-api-project.vercel.app` (no trailing `/api`).

These four `VITE_FIREBASE_*` values are public web-app configuration, not secrets. Never put service-account JSON, GitHub/Google client secrets, Vercel access tokens, Gemini keys, or Flutterwave secrets in a `VITE_*` variable.

## 2. Server/API variables (Vercel → Project → Settings → Environment Variables)

- `APP_URL` — **API origin** used to build OAuth callback URLs, e.g. `https://your-pothub-project.vercel.app`. No path or trailing slash. Keep this stable in production.
- `FRONTEND_URL` — **browser app origin** users should return to after server OAuth, e.g. `https://your-pothub-project.vercel.app` or your custom frontend domain. If frontend and API share one domain, set it to that same origin.
- `APP_ORIGIN` — exact browser origin allowed by API CORS. Usually the same value as `FRONTEND_URL`; no path or trailing slash.
- `SESSION_SECRET` — generate a new random value of at least 32 characters, for example with `openssl rand -hex 32`. Use a different value for production and preview. Do not reuse a public/example value.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — create a GitHub OAuth App at GitHub → Settings → Developer settings → OAuth Apps → New OAuth App. Homepage URL is your frontend URL. Authorization callback URL must be exactly `${APP_URL}/api/auth/github/callback`. Copy the Client ID and generate/copy the Client Secret into server-only Vercel variables.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application. Add `${APP_URL}/api/auth/google/callback` as an authorized redirect URI. These are used by the **native APK's server OAuth flow**. Browser Creator login uses Firebase Google Auth instead, so also enable Google in Firebase Authentication.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase Console → Project settings → Service accounts → Generate new private key; store the full JSON object as this server-only variable. Treat it like a password. Alternatively configure Google Application Default Credentials in a suitable server environment.
- `FIREBASE_PROJECT_ID` — Firebase project ID, if it cannot be inferred from the service account JSON.
- `POTHUB_VIDEO_MAX_BYTES` — optional maximum streamed video size in bytes; defaults to 157286400 (150 MiB).
- `GEMINI_API_KEY` — optional Pothub-managed server-side fallback provider key.
- `AI_FALLBACK_BASE_URL`, `AI_FALLBACK_API_KEY`, `AI_FALLBACK_MODEL` — optional server-managed fallback.
- `AI_MAX_PROMPT_CHARS`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_OPERATION_COST_USD` — optional server-side request/cost bounds.
- `POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS=true` — optional explicit opt-in for public HTTPS OpenAI-compatible/Anthropic-compatible endpoints other than official defaults. Keep unset unless you trust the endpoint.
- `FLW_CLIENT_ID`, `FLW_CLIENT_SECRET`, `FLW_ENCRYPTION_KEY` — Flutterwave v4 server credentials/encryption key. Obtain these from the Flutterwave dashboard/API credentials for the intended environment. Never use v3 keys or expose them to the browser.
- `FLW_MODE` — use `production` only with production credentials and a verified production webhook.

## 3. Vercel deployment diagnostics token

The current **Connect Vercel** button uses a Vercel REST API access token stored on the server. It is **not** a Vercel OAuth client ID/secret pair. To obtain it:

1. Sign in to Vercel and open your account Settings → Account Tokens (the Account Tokens page).
2. Create a token with a descriptive name, the narrowest account/team scope that covers the target project, and a short expiry if practical.
3. Copy it immediately; Vercel may not show the token again.
4. In the Pothub Vercel project, open Settings → Environment Variables and add `VERCEL_ACCESS_TOKEN` with the token value. Apply it to the environment where you are testing, then redeploy.
5. Sign in to Pothub as **Developer using GitHub** and press **Connect Vercel**.

The backend also accepts `VERCEL_TOKEN` or `VERCEL_API_TOKEN` as aliases, but prefer `VERCEL_ACCESS_TOKEN`. Never use a `VITE_` prefix. If you only have `VERCEL_CLIENT_ID`/`VERCEL_CLIENT_SECRET` from a Vercel OAuth/Sign in with Vercel integration, those do **not** satisfy this implementation; it needs an API access token. Alternatively, paste a personal access token into the field below Connect Vercel; the app encrypts it locally before storing it and sends it only with authenticated log/project requests.

Routes: `POST /api/vercel/connect`, `POST /api/vercel/projects`, `POST /api/vercel/deployments`, and `POST /api/vercel/logs`. These are read-only diagnostics; they do not deploy or change projects. Runtime-log availability depends on the Vercel API endpoint and account/project access; deployment events are not guaranteed to contain full runtime logs.

## 4. Provider setup checklist (browser authentication)

1. **GitHub Developer login:** create the OAuth App above and set the exact callback URL to `${APP_URL}/api/auth/github/callback`. The browser opens GitHub's own authorization page through `/api/auth/github`; the server exchanges the code and returns the browser to `FRONTEND_URL`.
2. **Google Creator login:** in Firebase Console → Authentication → Sign-in method, enable Google. In Authentication → Settings, add the production frontend hostname and any Preview hostname you actually use under Authorized domains. In Project settings → General, copy the web app config into the four `VITE_FIREBASE_*` variables.
3. **Recommended browser deployment:** keep the frontend and API on the same Vercel domain and leave `VITE_API_BASE` blank; this avoids cross-site cookie restrictions. If you split frontend/API across domains, `APP_URL` must point to the API host, `FRONTEND_URL` and `APP_ORIGIN` must point to the browser host, and `VITE_API_BASE` must point to the API origin. Cross-site session cookies may be blocked by browser privacy settings, so a same-origin deployment is the reliable choice unless cookie/CORS behavior is deliberately configured and tested.
4. **Database:** the server requires Firebase Admin credentials and Firestore. Create/enable Firestore in the Firebase project and check billing/quotas for your usage; this code does not require Firebase Storage.
5. **Redeploy:** changing Vercel environment variables does not update an already-built frontend or running deployment until a new deployment is made. Trigger a redeploy after changing them.

## 5. Security / verification

- Do not share tokens or service-account JSON in chat, screenshots, client-side source, or repository commits. If exposed, revoke/rotate them.
- Configure the Flutterwave webhook URL and verify its secret according to the existing v4 billing setup.
- Avoid logging request bodies containing BYO API keys or payment payloads.
- Native secure storage, OAuth deep-link handoff, video delivery, payments, and browser OAuth still need live-device/live-provider testing after deployment. Automated source tests alone do not prove those integrations work end-to-end.
