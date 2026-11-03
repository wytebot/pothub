# PotHub engineering pass — 2026-11-03

This ZIP contains a source-level implementation pass. It is not a claim that every item in the full product brief is complete or production-ready.

## Implemented in this pass

- Added a provider-native SSE token stream for Creator chat (Gemini, OpenAI-compatible, and Anthropic-compatible streaming protocols). This endpoint accepts saved agent IDs and resolves encrypted agent keys server-side. The Creator chat UI displays the user turn and assistant placeholder immediately and updates the response as token events arrive.
- Added a bounded planner/tool/synthesis loop for Codelab. It plans up to six read-only tool calls (`list_tree`, `read_file`, `read_many`, `search_code`), validates each path against the pinned repository tree, and treats repository content as untrusted. It proposes complete files in `CODEBLOCK` format; it does not claim those files were saved.
- Added signed HMAC Codelab scope claims, persisted immutable thread scope, scope verification, and scope deletion. Codelab planning, approved commits, and scoped PR creation verify the pinned repository and branch. A thread cannot be rebound to a different repository or branch.
- Added Firebase Storage resumable upload session creation and completion verification. File bytes upload directly to the Storage session URL rather than through the Vercel function body. Current per-file limit is 100 MiB and completion verifies account ownership and exact declared size.
- Added Firestore-backed durable job records, status reads, resumable SSE events (`Last-Event-ID`), cancellation, and a worker claim/update lease contract.
- Changed vault encryption to require a dedicated 32-byte hex `POTHUB_VAULT_ENCRYPTION_KEY`; added a dry-run-first migration script for records encrypted using the older `SESSION_SECRET` fallback.
- Added bounded worker result size, cross-origin SSE header allowance, and deployment notes.

## Required migration and deployment notes

1. **Vault key:** do not deploy a new dedicated key over records encrypted with the legacy `SESSION_SECRET` fallback. Back up Firestore, set both secrets locally, run `npm run vault:migrate` (dry run), review counts, then run `npm run vault:migrate -- --apply`. Only deploy the new key after migration succeeds. Do not run this migration against records already encrypted with a dedicated key.
2. **Storage:** set `FIREBASE_STORAGE_BUCKET` and apply `storage.cors.json` to the actual bucket. Confirm the production origin and `https://localhost` WebView origin.
3. **Worker:** set `POTHUB_JOB_WORKER_SECRET` to a random value of at least 32 characters. A separate trusted worker must poll `/api/internal/jobs/claim`, execute each job kind, and update it using both the worker secret and returned job lease. **This ZIP provides the durable queue and lease API, not a production executor for every image/video/file/agent job. Without a running worker, queued jobs remain queued.** Never expose the worker secret to the browser or APK.
4. **Large files:** uploads use the direct resumable Storage URL. The current completion path does not implement SHA-256 deduplication or a full malware/content scan.
5. **Identity:** this pass does not complete Google/GitHub/Vercel account merging or a migration of existing credit/token ownership. Existing auth-provider labels and some legacy routes remain. Do not claim unified identity is complete.
6. **Scope:** the new Codelab agent plan/commit/PR and loop paths use scope claims; not every legacy GitHub API route has been migrated to mandatory scope claims.

## Verified in this environment

- `node --check server/app.js`, `server/lib.js`, `server/workspace-vault.js`, `server/scope-claims.js`, `server/durable-jobs.js`, and `scripts/migrate-vault-key.mjs` passed.
- Targeted tests passed: **30/30** covering BYOK policy, agent routing, path policy, multi-commit policy, GitHub access policy, workspace vault, durable job events, and signed scope claims.
- `node scripts/release-audit.mjs` passed (static audit only).
- `npm run pricing:check` passed its configured margin target using a stated $0.05/order infrastructure estimate; this is not measured production telemetry.
- ZIP integrity is checked after packaging.

## Not verified / incomplete

- Full `npm test`: **196 passed, 26 failed**. Several failures are import-time failures because dependencies (including Express, Firebase Admin, `@hapi/iron`, and TypeScript) are unavailable; other existing model-catalog/provider-registry/static-source expectations also fail and require separate reconciliation.
- `npm install` / lockfile generation timed out against the package registry. No `package-lock.json` was fabricated. `npm ci`, `next build`, Capacitor export, and Android debug build were not run successfully.
- Live GitHub OAuth, actual GitHub commit/PR API calls, Firebase Storage resumable uploads/CORS, Flutterwave checkout/webhook, and real browser/APK downloads were not exercised.
- The durable queue requires an external worker executor; media jobs are not all wired to it. Job SSE streams job state, not provider tokens. Creator chat SSE is token-streaming; Codelab planner/synthesis still returns a completed response.
- Complete Google/GitHub/Vercel unified identity, all-route scope enforcement, SHA-256 upload deduplication, and complete large-app generation/commit orchestration remain outstanding.
