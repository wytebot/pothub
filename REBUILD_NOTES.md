# Pothub rebuild and wiring notes

## Folder map
- `src/ui/` — React 18 single-shell UI: welcome, role choice, Developer/Creator workspaces, API & Agents page, history, backup, credits and profile.
- `src/lib/` — Dexie schema, encrypted agent storage, ZIP backup codec, biometric page gate, native/browser adapter, and request/video helpers.
- `src/lib/video-adapters/` — provider-agnostic video interface and the Google Gemini/Veo long-running operation adapter.
- `server/` — Express API for OAuth, account provisioning, GitHub repository/Actions/file operations, AI proxy, video result charging, credit ledger and Flutterwave v4.
- `api/` — Vercel function entrypoints that forward requests into the Express app.
- `public/` — offline PWA shell, service worker, manifest and monochrome/maskable icons.
- `android-template/` — custom Android MediaStore Downloads plugin copied into the generated Capacitor project.
- `scripts/` — Android deep-link/plugin setup and static release audit.
- `tests/` — Node tests for source contracts, payment safety, API behavior and ZIP integrity.
- `docs/` — current agent/security, environment, pricing, compatibility and manual release test instructions.

## Backend routes and contracts

### Auth and profiles
- `GET /api/auth/github` — starts GitHub authorization-code OAuth with state + PKCE. `?native=1` returns through the one-time native ticket flow.
- `GET /api/auth/github/callback` — validates state, exchanges code with the PKCE verifier, validates provider identity, and creates the browser cookie or native ticket.
- `GET /api/auth/google/start?native=1` and `GET /api/auth/google/callback` — native system-browser Google OAuth and deep-link handoff.
- `POST /api/auth/google-session` — `{idToken}` from Firebase redirect → `{ok,user,credits,authProvider}`. Google accounts receive a profile and idempotent starter-credit ledger entry.
- `POST /api/auth/native-exchange` — `{ticket}` → `{session,user,credits,authProvider}`. Ticket use is recorded in Firestore and replay is rejected.
- `GET /api/auth/me`, `POST /api/auth/logout` — restore and clear the session.

### Developer / GitHub
- `GET /api/github/repos` → `{repos,count}`.
- `GET /api/github/actions-runs?owner=&repo=` → `{runs:[{id,name,runNumber,branch,status,conclusion,url,createdAt}]}`.
- `GET /api/github/actions-run?owner=&repo=&runId=` → `{runId,logs,jobs,note}`. The route fetches the Actions log archive, extracts bounded text logs, and appends job/step summaries; paste raw logs if the archive cannot be read.
- `GET /api/github/files?owner=&repo=&branch=` → `{files:[{path,size}]}`; sensitive names and large files are excluded.
- `GET /api/github/file?owner=&repo=&branch=&path=` → `{path,content}` for a bounded text file.
- `POST /api/diagnose` — `{repo:{owner,name,defaultBranch},logs,agentConfig:{keys:[{key,model,provider,baseUrl?,task}]}}` → `{summary,issues,branch,filesInspected,creditsSpent,creditsRemaining}`.
- `POST /api/repair/propose` — `{repo,issue,logs?,agentConfig}` → `{explanation,files:[{path,content,reason}],creditsReserved,creditsRemaining}`.
- `POST /api/github/commit-fix` — `{owner,repo,baseBranch,commitMessage,files:[{path,content}]}` → `{ok,branch,commitSha,commitUrl,branchUrl,files,note}`. Commits go to a new branch only.
- `POST /api/github/create-pr` — `{owner,repo,head,base,title,body?}` → `{ok,number,url,state,head,base}`.

### Creator, agents and media
- `POST /api/agent/test` — `{keys:[{key,model,provider?,baseUrl?,task?}]}` → `{results,best,policy}`. For image/video tasks the test checks key connectivity, not modality capability.
- `POST /api/agent/chat` — `{message,history?,attachments?,agentConfig}` → `{ok,text,creditsSpent,creditsRemaining}`. Text and image attachments are passed inline when bounded; other files are represented by metadata unless their text is extracted client-side.
- `POST /api/creator/image` — `{prompt,count,aspectRatio,agentConfig}` → `{images:[{mimeType,contentBase64,filename}],creditsSpent,creditsRemaining}`. The UI converts output to Blobs and stores them in IndexedDB.
- `POST /api/video/submit` — `{prompt,options:{aspectRatio},key,model}` → `202 {ok,jobId,state:'queued',creditsCharged:0}`.
- `POST /api/video/status` — `{jobId,key}` → `{ok,state,progress,resultUrl?,error?}`.
- `POST /api/video/result` — `{jobId,resultUrl,key}` → binary `video/mp4` or `video/webm` response, with `X-Pothub-Credits-Remaining` and `X-Pothub-Credits-Charged` headers. The current video adapter uses the Gemini Omni Flash Interactions API (`gemini-omni-1.1-flash`). The API fetches the completed video from Google and streams it directly to the app, without Firebase Storage. It validates MIME/size and charges using an idempotent user/job reference. Vercel streaming/runtime limits still apply; deploy with a suitable function duration and test with real generated videos.
- `POST /api/video/cancel` — `{jobId,key}` → `{ok,state:'cancelled',providerCancelled:false,message}`. Google Interactions API does not expose a supported cancel operation here; Pothub stops polling and never charges unless a result is delivered.

### Credits and payments
- `GET /api/pricing` and `GET /api/billing/config` — server-priced packs and checkout configuration.
- `POST /api/billing/checkout` — customer/billing details, `packId`, USD currency, and `{card:{nonce,encrypted_card_number,encrypted_expiry_month,encrypted_expiry_year,encrypted_cvv}}`. Sensitive card fields are AES-GCM encrypted in the client; raw card values are not sent.
- `POST /api/billing/authorize` — `{reference,type:'pin'|'otp'|'avs',...}` for supported authorization challenges.
- `POST /api/billing/verify` — `{reference}` → paid status and balance; server verifies persisted amount/currency/reference/charge ID.
- `POST /api/webhooks/flutterwave` — verified webhook; grants are idempotent.

### API key transport and endpoint security
Provider keys are carried in the POST body, not a custom header, for diagnosis/fix/chat/image requests. The API uses them only for that request and does not persist them. Default official OpenAI-compatible/Anthropic endpoints are used unless `POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS=true`; custom endpoints must be public HTTPS. Configure platform logs not to capture request bodies.

## Dexie schema and migration
- Version 1 retains legacy stores long enough to migrate old tasks/reports.
- Version 2 adds `agents`, `runs`, `chats`, `messages`, `attachments`, `videoJobs`, and `backups`; old task/report rows migrate into runs and obsolete stores are removed.
- Large media lives as IndexedDB `Blob`s. Generated images and video results are stored as Blobs, not base64 strings.
- Browser agent keys use AES-GCM with a non-extractable WebCrypto key in IndexedDB. Native agent keys use the same AES-GCM encryption with the key material stored through Android Keystore-backed secure storage. A migration re-encrypts older native agent rows before deleting the old IndexedDB key.
- Sign-out clears session tokens and local agent secrets. Backups exclude agents, keys and secure settings.
- JSON backups contain history and metadata. ZIP backups can include Blobs; restore validates the archive and shows table counts before confirmation.

## Biometric module scope
`src/lib/biometric.js` is imported by `src/ui/App.jsx` only to guard the API & Agents section. Browser HTTPS uses a WebAuthn platform authenticator; Android uses the native biometric prompt. It is off by default and never gates app launch, authentication, Creator or Developer workspaces. It is a local page-access gate, not server-side identity proof.

## Capacitor
- App ID: `ai.pothub.app`; web directory: `dist`.
- Run `npx cap add android` once, then `npm run android:configure`, `npm run cap:sync`.
- The Android setup script finds the generated `MainActivity.java`, derives its actual package, registers `PublicDownloadsPlugin`, and adds the `ai.pothub.app://auth` intent filter.
- `src/lib/platform.js` isolates system-browser auth, share and file save. Native secure storage is separate from the optional biometric gate.

## Removed files and features
The rebuilt tree removes these stale documents from the previous project: `AUDIT_REPORT.md`, `IMPLEMENTATION_STATUS.md`, `ROLE_WORKSPACES.md`, `AUTH_PROVIDER_SEPARATION.md`, `AUTH_FIX_REPORT.md`, `QUALITY_AUDIT.md`, `FINDINGS_LEDGER.md`, and `CHANGELOG.md`; they were superseded by this single current rebuild guide. Removed obsolete docs: `docs/IMPLEMENTATION_SUMMARY.md`, `docs/MULTI_OUTPUTS.md`, and `docs/SECRET_MODE_TESTS.md`; they described legacy features or contradicted the new page-scoped lock.

Additional dead code/config removed: the unused `GET /api/github/repo-context` route, the unused `OPERATIONS.file` credit cost, and obsolete Firestore indexes for monitored projects, Vercel OAuth states and app notifications. The retained `repoContext()` helper is still used internally by diagnosis/fix flows.

Legacy app code/features removed in the rebuild: File Studio and document/spreadsheet/PDF generation; Vercel OAuth consent and webhooks (the current optional Vercel connection is read-only API-token diagnostics implemented separately); Google Drive backup; push notifications/issue monitoring; app-wide Secret Mode/biometric gate; obsolete legal/settings navigation and UI; old Drive/client/Flutterwave helper modules (`src/lib/drive.js`, `src/lib/api.js`, `src/lib/flutterwave.js`) where present in the source revision. They are not hidden behind disabled buttons; the old UI and API route implementations are removed from the rebuilt app.

## Automated checks and remaining release verification
- `node --check` passes for the server and library modules.
- JSX syntax is parsed with the installed TypeScript parser.
- `node scripts/release-audit.mjs` passes.
- `npm test`: 23 tests pass, including ZIP round-trip/corruption tests.
- **Production Vite build and Android APK are not verified.** `npm install` repeatedly timed out in this execution environment, so dependencies could not be installed and the runtime bundle could not be built. Live OAuth, Flutterwave sandbox, provider video, native secure storage, MediaStore Downloads, WebAuthn/biometric, iOS Safari, and Android device tests remain mandatory before publishing. See `docs/DEVICE_TEST.md`.


## Vercel logs connection (optional)

The Developer workspace connects through Vercel OAuth. `GET /api/vercel/connect` starts the authorization redirect and `GET /api/vercel/callback` exchanges the code, validates the Vercel identity, and stores access/refresh tokens inside the signed HttpOnly Pothub session. The server refreshes expiring access tokens. `POST /api/vercel/projects`, `POST /api/vercel/deployments`, and `POST /api/vercel/logs` use that session; no token is entered or persisted in browser IndexedDB. The connection is read-only and does not deploy or modify Vercel projects. Available logs depend on the Vercel account permissions and API support.

## Vercel OAuth update
- Removed the manual access-token input and all client-side Vercel token persistence.
- Added OAuth start, callback, disconnect, and connection-status routes.
- Project discovery checks personal projects and accessible teams where the Vercel API permits it.
- Updated environment documentation to use the existing Vercel OAuth client credentials and exact callback URL.
- Existing Firebase browser SDK configuration remains in use; no new Firebase configuration values were introduced.


## Browser OAuth/API routing hotfix (2026-10-29)
- Removed the global `/(.*) -> /index.html` Vercel rewrite. That broad fallback can mask an API route when the deployment's function routing does not match, causing HTML/non-JSON 405 responses for POST requests such as `/api/auth/google-session` and sending auth-start URLs back to the SPA instead of the provider.
- Kept the Firebase `__/auth/*` proxy rewrite. Vercel's filesystem/function routing should resolve `/api/*` to the API functions; confirm `/api/health` returns JSON and `/api/auth/github` responds with a GitHub redirect after deployment.
- Browser Developer sign-in uses same-origin navigation to `GET /api/auth/github`; this is a web redirect, not Capacitor/native flow. Only the APK appends `?native=1` and uses the native ticket/deep-link flow.
- If `/api/health` still returns a platform HTML page or 405 after redeployment, the Vercel project is not deploying this folder as its Root Directory or its API functions are not included in the deployment. Set the Vercel Root Directory to `pothub-fixed` (or upload the contents of this folder as the project root) and redeploy.
