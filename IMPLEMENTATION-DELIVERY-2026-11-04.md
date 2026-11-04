# PotHub remaining engineering pass — 2026-11-04

This is a source-level hardening pass against the supplied PotHub archive. It does **not** claim the full product brief is production-complete; build and live integration verification remain blocked by dependency/network availability and credentials/device access.

## New changes in this pass

- Connected Codelab's large attachment path end to end: the client sends upload ID and declared size; the server checks account-scoped upload records, completion state, expiry, declared size, Storage ownership and actual object size before using the file.
- Added bounded server-side extraction for supported plain-text files in Firebase Storage. The server reads at most 1 MiB per attachment and forwards at most 60,000 characters into the Codelab planning/synthesis context. Binary media is not loaded wholesale into the serverless function.
- Added Codelab image payload forwarding. Images are passed only when the selected saved Chat agent's provider advertises vision capability; otherwise the user receives a configuration error rather than silent metadata-only analysis.
- Improved GCS resumable upload recovery: progress callbacks, retry handling, querying server-confirmed offset after a network failure, cancellation signal support, and final completion verification.
- Expanded Codelab attachment selection to common DOCX, XLSX, ZIP, image, PDF and source/text formats up to the existing 100 MiB application cap.
- Converted long Codelab text prompts over 8,000 characters into a generated PDF attachment while retaining the original prompt text as model context; the server receives a short request instead of a large body.
- Added an Android debug build step and artifact upload to production CI. It requires the GitHub repository variable `NEXT_PUBLIC_API_BASE` and blocks deployment if the native build fails.
- Added focused regression tests for large-upload wiring, ownership/size validation, long prompt PDF handling, image capability gating, and the Android CI gate.

## Configuration / migration

1. Run GitHub Actions → **Generate and commit PotHub npm lockfile** on a networked runner. The lockfile is not included because this environment cannot resolve npm registry metadata (offline attempt returned `ENOTCACHED`; online resolution timed out).
2. Set repository variable `NEXT_PUBLIC_API_BASE` to the deployed PotHub API origin (HTTPS, no trailing path) so the Android export targets the service.
3. Keep Firebase Admin credentials and `FIREBASE_STORAGE_BUCKET` configured on the server. Apply `storage.cors.json` to the Storage bucket so `https://localhost` and the production web origin can upload directly.
4. The production workflow now runs `npm ci`, `npm run check`, web build, Capacitor export, Android debug APK build, then Vercel production deployment. It requires Vercel Actions secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.
5. OAuth callbacks and account linking must still be tested against actual Google, GitHub and Vercel client settings after deployment.

## Verified in this environment

- `node --check server/app.js` — passed.
- `node --check server/lib.js` — passed.
- TypeScript JSX parser diagnostics for `src/ui/App.jsx` and `src/ui/WorkspaceSection.jsx` — zero syntax diagnostics.
- `node scripts/release-audit.mjs` — passed (static audit only).
- `node scripts/pricing-check.mjs` — passed. The $0.05/order infrastructure amount remains a planning estimate, not a measured invoice cost.
- Focused regression tests — 14/14 passed: agent capability selection, request intent, scope claims, large Codelab uploads, image capability gating, long prompt PDF behavior, and Android CI gate.
- Full test run — 213 tests passed; 28 test files failed to load due to missing installed dependencies (`express`, `firebase-admin`, `@hapi/iron`, and `typescript`). This is not a green full suite.
- ZIP integrity — checked after packaging.

## Not verified / incomplete

- `npm ci`, `next build`, Capacitor export, Android `assembleDebug`, and deployment were not run because dependency installation could not complete in this environment.
- No live browser or APK test was run. Crash-free pages, mobile/desktop screenshots, Lighthouse, bundle budgets, haptics, app resume/offline recovery and all download formats (including 50+ MiB files) remain unverified.
- Storage upload was not tested against a live Firebase bucket; the implementation is statically tested only. The direct GCS upload protocol and bucket CORS must be verified in staging.
- Codelab's agent route remains read-only. Commit/PR flows are separate approval-gated endpoints and still require end-to-end tests against a real GitHub repository.
- Durable job APIs provide persisted state and SSE, but actual execution requires a separately deployed worker. Image/video provider lifecycle coverage and resumable job execution are not certified complete.
- Provider compatibility is limited to the capabilities and protocols implemented in `provider-registry.js`; unsupported media functions must remain unavailable rather than appear configured.
- Google/GitHub/Vercel OAuth, Flutterwave, signed media, credit refunds, webhook replay protection, all gestures and every requested visual detail have not been live-tested.

Do not treat this archive as a production-certified release until the lockfile workflow succeeds and the complete CI plus staging integration tests pass.
