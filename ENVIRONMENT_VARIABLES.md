# Pothub environment variables (Next.js + Vercel)

Pothub's frontend is Next.js and exports static files to `out/`. The Vercel functions in `api/` run the existing Express backend. **Do not configure Vercel to run Vite, use `dist/`, or use `VITE_*` variables for this version.** The Next.js `NEXT_PUBLIC_*` variables are embedded into the frontend at build time, so redeploy after changing them.

## Required Vercel variables

Set these under **Vercel → Project → Settings → Environment Variables** for Production, and for Preview/Development if you use those environments. Use real credentials, never the placeholder examples below.

| Variable | What to set |
|---|---|
| `APP_URL` | Public API origin, e.g. `https://YOUR-PROJECT.vercel.app` (no path/trailing slash). |
| `FRONTEND_URL` | Public browser app origin. If frontend and API share the Vercel domain, use the same origin as `APP_URL`. |
| `APP_ORIGIN` | Exact browser origin allowed by API CORS; usually the same value as `FRONTEND_URL`. |
| `SESSION_SECRET` | Random secret of at least 32 characters. Generate a unique value per environment, e.g. `openssl rand -hex 32`. |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID. |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret; server-only. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase service-account JSON, stored as a server-only secret. Do not prefix with `NEXT_PUBLIC_`. |
| `FIREBASE_PROJECT_ID` | `pothub-ca2a1` (can be inferred from service-account JSON, but set it explicitly for clarity). |
| `GEMINI_API_KEY` | Pothub-managed server-side Gemini fallback key. The current `/api/health` readiness check expects this to be set. Never expose it to the browser. |
| `FLW_CLIENT_ID` | Flutterwave v4 client ID for the chosen environment. |
| `FLW_CLIENT_SECRET` | Flutterwave v4 client secret; server-only. |
| `FLW_ENCRYPTION_KEY` | Flutterwave v4 encryption key for the same environment. |

The current `/api/health` endpoint marks the deployment degraded if `APP_URL`, `FRONTEND_URL`, `SESSION_SECRET`, GitHub credentials, `GEMINI_API_KEY`, Flutterwave v4 credentials, or Firebase Admin credentials are missing. This is the code's current readiness contract, even if you do not intend to use every integration immediately.

## Frontend build-time variables

| Variable | What to set |
|---|---|
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Optional. For the same-origin Firebase helper proxy, set to the frontend hostname only, e.g. `YOUR-PROJECT.vercel.app` (no scheme/path). If omitted, the embedded SDK uses `pothub-ca2a1.firebaseapp.com`. When set to your hostname, add that hostname to Firebase Console → Authentication → Settings → Authorized domains. `vercel.json` proxies `/__/auth/*` to the project's Firebase helper domain. |
| `NEXT_PUBLIC_API_BASE` | Leave blank/undefined when the browser frontend and API use the same origin. If they are on separate domains, set this to the API origin only (e.g. `https://YOUR-API.vercel.app`, no `/api`). For a locally generated APK, set it to the public API origin **before** building/syncing the APK, because the APK's local origin cannot call relative `/api` paths. |

These are the only frontend build variables normally needed. Firebase web config is embedded in `src/lib/firebase.js`; its web API key is public project configuration, not an Admin credential. Never put `SESSION_SECRET`, OAuth client secrets, Firebase service-account JSON, Gemini keys, or Flutterwave secrets into any `NEXT_PUBLIC_*` variable.

## Optional variables for additional integrations

Only configure these if you use the corresponding feature or need to override its defaults:

- `AI_FALLBACK_BASE_URL`, `AI_FALLBACK_API_KEY`, `AI_FALLBACK_MODEL` — server-side OpenAI-compatible fallback provider. Keep the key private. The current readiness check still expects `GEMINI_API_KEY`.
- `AI_MAX_PROMPT_CHARS`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_OPERATION_COST_USD` — server-side AI limits.
- `POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS=true` — explicitly allows trusted custom HTTPS agent endpoints; leave unset unless needed.
- `POTHUB_VIDEO_MAX_BYTES` — video response size limit in bytes; default is 157286400 (150 MiB).
- `FLW_MODE` — use `production` only with production Flutterwave v4 credentials and a verified production webhook.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — native Android server OAuth only, not browser Google login.
- Vercel diagnostics OAuth: `VERCEL_CLIENT_ID` / `VERCEL_CLIENT_SECRET`, or supported aliases `VERCEL_OAUTH_CLIENT_ID` / `VERCEL_OAUTH_CLIENT_SECRET` or `VERCEL_APP_CLIENT_ID` / `VERCEL_APP_CLIENT_SECRET`. The callback is `APP_URL/api/vercel/callback`.

## OAuth provider setup

### GitHub browser login

Create a GitHub OAuth App. Set its homepage URL to `FRONTEND_URL` and its authorization callback URL to exactly:

`APP_URL/api/auth/github/callback`

Use the same domain/path values as Vercel, without trailing slashes in `APP_URL`. Browser login sends the user to GitHub's authorization page; GitHub Client Secret remains server-side.

### Google browser login

In Firebase Console → Authentication → Sign-in method, enable Google. Add the frontend hostname (and any Preview hostname used) under Authentication → Settings → Authorized domains. Browser Google login uses Firebase Auth; `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are only required for the separate native Android server OAuth flow.

### Optional native Google OAuth

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Register `APP_URL/api/auth/google/callback` as the redirect URI for the native OAuth client when using that flow.

### Optional Vercel diagnostics connection

Keep these server-only if the **Connect Vercel** feature is used: `VERCEL_CLIENT_ID` and `VERCEL_CLIENT_SECRET`, or the existing supported aliases `VERCEL_OAUTH_CLIENT_ID` / `VERCEL_OAUTH_CLIENT_SECRET` or `VERCEL_APP_CLIENT_ID` / `VERCEL_APP_CLIENT_SECRET`. Register `APP_URL/api/vercel/callback` as the exact callback. Do not put the client secret in a `NEXT_PUBLIC_*` variable.

## Deploy/build settings

- **Framework preset:** Next.js.
- **Build command:** `npm run build`.
- **Output directory:** `out` (the project uses Next.js static export for the browser UI and Capacitor).
- Do not set `dist` as the output directory or override the build command with Vite commands.
- Keep the `api/` folder and `vercel.json`; they route requests to the existing Express API functions.
- After changing variables, redeploy so Next.js embeds the new `NEXT_PUBLIC_*` values and Vercel functions receive the new server values.
- Test `https://YOUR-PROJECT.vercel.app/api/health`; it should return JSON. Then test GitHub login, Google login, a read-only GitHub operation, and Flutterwave sandbox verification.

## Local / Android build

1. Install Node.js 20+ and run `npm install`.
2. For the web UI run `npm run dev`; for the API locally run `npm run dev:api` in a second terminal.
3. Run `npm run check`, then `npm run build`. The build prepares the PDF.js worker and stamps the service worker with the deployment/build identifier.
4. Before building Android, set `NEXT_PUBLIC_API_BASE` to the deployed API origin, then run `npm run cap:sync`. `capacitor.config.json` uses `webDir: "out"`.

## Security

Never commit `.env` files or credentials. If any secret is exposed, revoke/rotate it. Automated tests and source audits are not proof of live OAuth, billing, AI provider, or APK behavior; verify those integrations in the deployed environment before release.
