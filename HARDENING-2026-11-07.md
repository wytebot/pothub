# Operations and flows hardening — 2026-11-07

## Fixed
1. **Arcade credit farming** (`/api/arcade/reward`): score and elapsed time are client-reported, and nothing capped how many credits an account could collect. Rewards are now limited to 20 per account per UTC day, counted in a Firestore transaction (`arcade_reward_days`). Retrying a counted milestone is a duplicate rather than a second slot, and a failed grant gives its slot back. The game screens show a daily-limit message.
2. **Cron secret** (`/api/cron/reconcile-credit-reservations`): the bearer token was compared with `!==`. It now uses a constant-time check (`isValidBearerSecret`) and requires a secret of at least 16 characters.
3. **Job queue idempotency**: `operationId` was stored but never used, so a client retry created duplicate jobs. Job IDs are now derived from account + operationId and a retry returns the existing job (HTTP 200, `duplicate:true`).
4. **Job queue flooding**: each account is capped at 20 queued/running jobs (HTTP 429 `TOO_MANY_ACTIVE_JOBS`).
5. **Stuck jobs**: if a worker died, its job stayed `running` forever. `/api/internal/jobs/claim` now re-queues jobs whose lease expired, and fails them after 3 attempts.
6. **Firestore config**: the worker claim uses collection-group queries on `jobs.state`, which need an index exemption that `firestore.indexes.json` did not declare. Added it, plus the `state + leaseExpiresAt` index. **Deploy with `firebase deploy --only firestore:indexes` before the new claim logic is used.**
7. **Checkout**: reusing an idempotency key with a different pack used to return the old order silently. It now returns 409.

## Tests
`tests/hardening-2026-11-07.test.mjs` (8 tests) passes. Full suite: 404 pass, 17 fail. The same 17 failed before these changes because `express`, `firebase-admin`, `@hapi/iron`, `jszip` and `typescript` are not installed here.

## Not verified
No server, Firestore, Flutterwave or device run was possible in this environment (no network for npm). The `app.js` changes pass `node --check` and source-level tests only. The two edited `.jsx` files were not compiled. Run `npm ci && npm run check` and a staging smoke test of the reward, job-create and job-claim routes before release.
