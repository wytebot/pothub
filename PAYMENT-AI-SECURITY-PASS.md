# Payment, AI response and repository-write hardening (2026-11-03)

## Changes in this pass

- Flutterwave webhook settlement now goes through the same payment-reference credit-grant path as the verified checkout callback. The provider charge is verified server-side and the credit grant is idempotent by payment reference. Order status reconciliation errors fail closed and are logged without card data.
- Creator streaming prompt now asks for clear Markdown, practical verification commands, explicit assumptions and risks, and honest distinctions between proposals and actions actually performed.
- Disabled the legacy `/api/github/commit-fix` route because it allowed writes without an immutable scope claim or expected base SHA. Clients must use `/api/github/agent/commit-approved`, which requires `approved: true`, persisted scope, and the reviewed base SHA, and writes to a review branch.
- Migrated the primary Developer repair flow and WorkspaceSection file-apply flows to the scoped approved-commit endpoint. Pull-request creation now requires a persisted scope claim.
- Updated the pricing regression test to the configured Starter 120 / Developer 350 / Professional 700 / Power 1400 credit counts.

## Deployment and compatibility notes

- Deploy the server and client files together. Old clients calling `/api/github/commit-fix` will receive HTTP 410 and must refresh to the new UI.
- Existing connected GitHub sessions must have the required repository write permissions. Workflow-file changes additionally require the optional `workflow` scope.
- `POTHUB_JOB_WORKER_SECRET`, Firebase Admin, Firebase Storage, and the existing payment environment variables still need to be configured in the deployment environment.
- This pass does not create a production worker for queued image/video/file jobs. Durable job records still require a separately deployed executor before those queued jobs can complete.
- Flutterwave checkout/webhook logic was not tested against live or sandbox credentials in this environment.

## Verification run

- `node --check server/app.js`: passed.
- TypeScript parser `transpileModule` parse of `src/ui/App.jsx` and `src/ui/WorkspaceSection.jsx`: passed (syntax parse only; not a Next.js production build).
- Targeted tests: core, URL-safety, vault, and new payment/AI hardening tests run separately; missing runtime dependencies prevented some integration tests.
- `node scripts/release-audit.mjs`: passed (static audit only).
- `node scripts/pricing-check.mjs`: passed under documented assumptions; infrastructure cost is an estimate, not measured production telemetry.
- Full `npm ci`, `npm run check`, `next build`, Capacitor export, Android debug build, live GitHub, Firebase, Flutterwave and browser/APK tests: not verified.
