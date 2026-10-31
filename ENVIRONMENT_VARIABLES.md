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
| `POTHUB_VAULT_ENCRYPTION_KEY` | Strong server-only key used to encrypt saved provider API keys in each account's Firestore workspace vault. Generate with `openssl rand -hex 32`; never expose it as `NEXT_PUBLIC_*`. If unset, `SESSION_SECRET` is used as a compatibility fallback. Keep this value stable across deployments or saved provider keys cannot be decrypted. |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID. |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret; server-only. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase service-account JSON, stored as a server-only secret. Do not prefix with `NEXT_PUBLIC_`. |
| `FIREBASE_PROJECT_ID` | `pothub-ca2a1` (can be inferred from service-account JSON, but set it explicitly for clarity). |
| `GEMINI_API_KEY` | Pothub-managed server-side Gemini fallback key. The current `/api/health` readiness check expects this to be set. Never expose it to the browser. |
| `FLW_SECRET_KEY` | Flutterwave Standard hosted-checkout secret key for the selected environment; server-only. Required for creating hosted payment links and verifying transactions. |
| `FLW_WEBHOOK_SECRET_HASH` | Merchant webhook secret configured in Flutterwave. Used for constant-time verification of hosted Standard webhooks; v4 signed webhook events use the HMAC signature branch. |
| `DEVICE_FINGERPRINT_SECRET` | Optional dedicated HMAC pepper (32+ random characters) for server-derived starter-credit device claims. If omitted, `SESSION_SECRET` is used. Never expose it to the client. |
| `FIREBASE_STORAGE_BUCKET` | Optional Firebase Storage bucket name. Defaults to `<FIREBASE_PROJECT_ID>.firebasestorage.app`; required IAM permissions must allow object creation and signed URL generation. |

The current `/api/health` endpoint marks core readiness based on Firebase Admin/Firestore and `SESSION_SECRET`. Optional integrations are reported separately; hosted Flutterwave checkout is shown as available when `FLW_SECRET_KEY` and `FLW_WEBHOOK_SECRET_HASH` are configured.

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
- `FLW_MODE` — retained for legacy v4 charge paths; hosted checkout uses the matching Flutterwave Standard secret key for the same environment.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — native Android server OAuth only, not browser Google login.

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



## Deploy/build settings

- **Framework preset:** Next.js.
- **Build command:** `npm run build`.
- **Output directory:** leave the Vercel default; do not set `out`. The browser deployment is a normal Next.js server app with the API route at `pages/api/[...path].js`.
- Do not override the build command with Vite commands.
- Keep `pages/api/[...path].js`, `server/`, and `vercel.json` together so API routes deploy with the UI.
- After changing variables, redeploy so Next.js embeds the new `NEXT_PUBLIC_*` values and Vercel functions receive the new server values.
- Test `https://YOUR-PROJECT.vercel.app/api/health`; it should return JSON. Then test GitHub login, Google login, a read-only GitHub operation, and Flutterwave sandbox verification.

## Local / Android build

1. Install Node.js 20+ and run `npm install`.
2. For the web UI run `npm run dev`; for the API locally run `npm run dev:api` in a second terminal.
3. Run `npm run check`, then `npm run build`. The build prepares the PDF.js worker and stamps the service worker with the deployment/build identifier.
4. Before building Android, set `NEXT_PUBLIC_API_BASE` to the deployed API origin, then run `npm run cap:sync`. The dedicated `build:cap` script temporarily excludes the server API route and uses a static export config only for the Capacitor build, then restores the server config. `capacitor.config.json` uses `webDir: "out"`.

## Security

Never commit `.env` files or credentials. If any secret is exposed, revoke/rotate it. Automated tests and source audits are not proof of live OAuth, billing, AI provider, or APK behavior; verify those integrations in the deployed environment before release.

## Additional BYOK / recovery / pricing notes

No new environment variable is required for the current provider-registry, live-model-discovery, recovery-sheet, Verified Fix, or local-library additions. Existing `POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS=true` remains the opt-in gate for trusted custom public HTTPS endpoints. Keep it unset unless you have reviewed the endpoint. Image adapters support Gemini, OpenAI Images, Stability, Replicate, fal and Black Forest Labs. Video adapters support Gemini, Runway, Luma, Kling and Replicate. Each provider still requires a valid BYOK credential and model ID; provider-specific billing is charged by the upstream provider separately.

The pricing analysis uses an assumed 60% target margin and illustrative provider rate inputs in `server/pricing.js`. It does not change `PACKS`, public prices or credit costs. Reconcile all rate-card inputs with current vendor invoices and actual Flutterwave/Play fee contracts before approving price changes.


## Additional integration pass

No new runtime environment variable is required for credit reservations, provider circuit breaking, local passcode fallback, or Verified Fix branch revert. The admin reconciliation script reuses `FIREBASE_SERVICE_ACCOUNT_JSON` (or Application Default Credentials) and optionally `FIREBASE_PROJECT_ID`; run it only from a trusted administrator environment. Starter-credit abuse prevention derives HMAC fingerprints from the HttpOnly server-issued `pothub_device_id` cookie and server-observed user-agent, with a separate server-observed IP/user-agent cap of five new starter grants per day. Never accept a device hash from request JSON or headers. `POTHUB_VIDEO_MAX_BYTES` remains optional and is now capped at 80 MB regardless of a higher configured value.

## Additional image adapters

No new environment variables are required. Image provider credentials are BYOK and remain transient in the authenticated POST request; they are not added to Vercel environment variables or persisted server-side. Custom image API endpoints continue to require `POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS=true` and must be public HTTPS endpoints.

## Additional security and asynchronous media configuration

- `APP_ORIGIN` (required for browser WebAuthn) must be the exact HTTPS origin used by the browser app, e.g. `https://your-pothub-domain.example`, with no path. It should match `FRONTEND_URL` for a same-origin deployment. The WebAuthn relying-party ID is derived from this hostname.
- `POTHUB_VIDEO_MAX_BYTES` (optional) controls the maximum delivered video size in bytes. Default: `83886080` (80 MB). Hard maximum: 150 MB.
- `@simplewebauthn/server` is installed as an application dependency for server-side registration/assertion verification. The server sets `CBOR_NATIVE_ACCELERATION_DISABLED=true` before loading it to avoid optional native CBOR acceleration issues in serverless bundles.

Firestore Admin must be configured for durable `media_jobs`, provider-health persistence, WebAuthn credentials/challenges and server-verified PIN fallback. Deploy `firebase.json` TTL policies for `expiresAt` on `browser_sessions`, `native_ticket_uses`, `browser_auth_tickets`, `media_jobs`, `webauthn_challenges`, `ai_operations`, `firebase_session_exchanges`, and `vercel_refresh_locks`, plus `resetAt` on `rate_limits`.

### Credit reservation reconciliation

- `CRON_SECRET` — required by `/api/cron/reconcile-credit-reservations`. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>`. Use a random secret of at least 32 characters. The scheduled daily route releases only stale reservations whose Firestore `expiresAt` has passed.

### Application origins

- `APP_URL` — canonical public API/application origin used for OAuth callback construction.
- `FRONTEND_URL` — browser redirect origin after OAuth.
- `APP_ORIGIN` — allowed browser/native CORS origin. `capacitor://localhost`, `http://localhost`, and `https://localhost` are also allowed for native development/runtime.

These remain separate compatibility settings in this release; configure all three consistently for production.

### Hosted Flutterwave checkout and signed media

- PotHub no longer collects or forwards PAN/CVV. `POST /api/billing/checkout` creates a Flutterwave Standard hosted payment link; the browser navigates to Flutterwave and returns with `tx_ref`/`transaction_id`. Verification is server-side by transaction ID or by `tx_ref` when the ID was lost.
- Set `FLW_SECRET_KEY` and `FLW_WEBHOOK_SECRET_HASH` for the same environment. The old client encryption key is no longer returned by `/api/billing/config`; remove obsolete `FLW_ENCRYPTION_KEY` from deployment variables after confirming no other legacy service uses it.
- Set `FIREBASE_STORAGE_BUCKET` if the default bucket name is not correct. Generated images are stored in private Firebase Storage objects and returned as short-lived signed URLs. Apply `storage.cors.json` to the bucket so the browser/Capacitor app can fetch signed image URLs (for example: `gcloud storage buckets update gs://YOUR_BUCKET --cors-file=storage.cors.json`).
- Kling's current new-model endpoints use `Authorization: Bearer <API_KEY>` (not a legacy AK/SK JWT); use a Kling API key created in the Kling developer console. Legacy endpoints that require AK/SK JWT are not used by this adapter.


## Account workspace sync

PotHub uses Dexie/IndexedDB as its persistent local database and requests browser persistent-storage permission on startup. Authenticated workspace records (saved agents, prompt templates, chats, messages, runs, projects, and attachment/video metadata) are synchronized to the account-scoped `account_workspaces/{userHash}/items` Firestore collection through authenticated server routes. Firestore client rules remain deny-all; only Firebase Admin on the server accesses this collection. Saved provider API keys are decrypted only in the signed-in client, sent over HTTPS to the authenticated sync endpoint, and re-encrypted with AES-256-GCM using `POTHUB_VAULT_ENCRYPTION_KEY` before Firestore storage. Set this key in Vercel Production, Preview, and Development consistently. The same key must be retained during rotations; rotating it requires a migration of existing encrypted agent records. Binary attachment and generated-media blobs remain in the local IndexedDB and should be included in the ZIP backup when moving devices. The service worker caches only immutable static assets; HTML document navigations are network-only and no-store.


## Currency display

| `POTHUB_USD_NGN_RATE` | Optional | Indicative USD-to-NGN display conversion rate. Defaults to 1347; update when your published naira equivalents should change. |
