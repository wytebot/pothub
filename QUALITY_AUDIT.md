# Pothub quality audit — 2026-10-28

## Fixes made in this pass
- Added `helmet` to runtime dependencies because `server/app.js` imports it; without it, server startup would fail after a clean install.
- Added explicit IDs to server-side credit packs. Checkout stores `pack_id: pack.id`; the IDs were previously missing, so purchase creation could fail against the non-null `credit_orders.pack_id` column.
- Expanded the static release audit to check critical server runtime dependencies and that server-side pack IDs match the UI pack IDs.

## Checks executed
- `node --check server/app.js` — PASS
- `node --check server/lib.js` — PASS
- `node scripts/release-audit.mjs` — PASS
- `npm install --no-audit --no-fund` — TIMEOUT in this environment; dependencies could not be installed.
- `npm run build` — NOT RUN successfully because dependency installation did not complete; a production build is not verified.

## Important functional limits discovered by source inspection
- Diagnosis is not a literal full-repository scan. `repoContext()` reads a bounded selection of key files and sends that selected context plus optional logs to the model. Large repositories, deep dependency chains, and runtime-only defects can be missed. The UI must not promise that nothing can be missed.
- AI findings are hypotheses grounded in selected files/logs. They are not proof that a bug exists or that a repair is correct. Tests/builds must be executed independently before a fix is described as verified.
- AI cost protection uses configured token/cost estimates. It is not a provider invoice or guaranteed hard cost ceiling. Provider pricing, actual usage, retries, and fallback pricing must be monitored.
- Supabase is the active required primary store for server-side credits and account records. Firestore is not implemented as an end-to-end fallback adapter.
- A full BYOK Dev Studio provider-routing flow is not yet implemented. The app must not advertise this as complete.
- Vercel OAuth, GitHub OAuth, Flutterwave payments, webhooks, Android downloads/push, and PWA offline behavior require live integration tests with correctly configured credentials and actual target devices.
- The service-worker cache does not make authenticated API operations available offline. Offline mode should clearly disable remote diagnosis, builds, deployment logs, and commits while allowing local history and files.
- Credit refunds are best-effort if the AI request fails; if the refund database operation itself fails, an operator-visible reconciliation path is needed.
- The current diagnosis context has a file/path cap and only inspects selected file contents. Consider a bounded multi-pass scan that prioritizes manifests, lockfiles, CI configs, source entry points, tests, and files named by logs, while preserving explicit limits on spend and context size.

## Required pre-release integration tests
1. Clean install, frontend production build, and server startup.
2. Apply `supabase/schema.sql` to a disposable Supabase project and test profile initialization, duplicate-device policy, atomic spend, refund, and idempotent grant.
3. Complete each Flutterwave pack purchase in sandbox, including PIN/OTP/redirect flows; replay webhook and verify credits are granted exactly once.
4. Test GitHub OAuth state mismatch/expiry, native handoff expiry, repository access boundaries, and branch creation on a disposable repo.
5. Test Vercel OAuth connect, refresh, disconnect/revoke, project selection, and deployment-log permissions.
6. Send signed and invalid GitHub/Vercel webhook fixtures; verify deduplication and push delivery.
7. Test generated TXT/JSON/CSV/HTML/PDF/DOCX/XLSX files with real parsers/viewers and test browser and Android save paths.
8. Install PWA on Chromium, go offline after first successful load, reopen it offline, and verify local history; ensure API calls fail clearly rather than showing stale success.
9. Build/install standalone Android APK, test OAuth deep links, storage permissions, push permissions, and file downloads on real devices.
10. Run abuse tests for concurrent AI calls, repeated account creation, credit exhaustion, rate limits, oversized requests, path traversal, and provider outage/fallback.

## Release status
Not production-certified. Static checks passing is useful but does not replace a complete build, database migration test, live-provider test, or Android/PWA end-to-end test.
