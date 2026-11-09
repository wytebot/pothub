# PotHub Codelab delivery notes — 2026-11-02

## Changes in this pass
- `server/app.js`: added a single server-side billing configuration gate requiring `FLW_CLIENT_ID`, `FLW_CLIENT_SECRET` (with `FLW_SECRET_KEY` compatibility fallback), `FLW_ENCRYPTION_KEY`, `WYBUILD_WEBHOOK_SHARED_SECRET`, and a configured billing database. Both billing config and checkout fail closed with an explicit “Billing not configured” response.
- `server/flutterwave-hosted.js`: transaction verification now requires the amount to exactly equal the persisted order amount; it no longer accepts a greater amount as a match.
- `tests/flutterwave-hosted.test.mjs`: updated successful fixture to match the persisted order amount exactly and added overpayment mismatch coverage.
- `ENVIRONMENT_VARIABLES.md`: documented the required server-only billing variables and removed contradictory instructions to delete the encryption key.
- `src/ui/codelab/pages/Legal.jsx`: replaced user-facing WyteLab brand references with PotHub Codelab.
- `src/ui/codelab/pages/Actions.jsx`: replaced user-facing WyteLab brand references and obsolete plan reminder copy.
- `src/ui/codelab/pages/Repositories.jsx`: replaced user-facing WyteLab plan branding.
- `src/ui/codelab/pages/Settings.jsx`: replaced user-facing WyteLab branding and outdated plan reminder copy.
- `src/ui/codelab/pages/Project.jsx`: replaced user-facing WyteLab text with PotHub Codelab; retained `window.__WYTELAB_PREVIEW__` compatibility bridge identifier.
- `src/ui/codelab/components/Menu.jsx`: replaced visible brand label.
- `src/ui/codelab/components/TopBar.jsx`: replaced visible brand label.
- `src/ui/codelab/components/ToastHost.jsx`: replaced notification branding and accessible label.
- `src/ui/codelab/logs.js`: replaced visible log export title.

## Explicit verification limits
- `node --check server/app.js` and `node --check server/flutterwave-hosted.js` passed after edits.
- Full `npm install` did not finish within the available execution window; no clean dependency install, `npm run build`, or complete `npm run check` is claimed.
- Real Chrome desktop, Safari iOS, Chrome Android, and Capacitor APK runtime tests were not available in this execution.
- The requested full Cursor-class editor/agent implementation, Firestore-transaction migration, all-route integration tests, full Creator queue/history/attachment UX, and all-platform runtime validation are not completed by this pass. Existing code has a mixed persistence architecture and existing hosted-checkout/webhook paths; those areas need dedicated implementation and integration testing before this ZIP should be considered production-ready.

## Credit meter correction (follow-up)
- `server/credit-policy.js`: moved the one-credit charge boundary to the first AI workflow in each batch of three successful workflows (completed counts 0, 3, 6, ...), rather than the third workflow. This makes the first AI job reserve the credit immediately; the following two successful jobs are covered by that credit.
- `server/lib.js`: clarified shared meter serialization and failure semantics. A failed workflow releases its reservation and does not advance the successful-workflow count, so a retry can use the same batch-start charge.
- `tests/ai-workflow-credit-policy.test.mjs`: updated batch boundary tests for immediate first-job charging, the two covered jobs, the next batch boundary, and invalid negative counters.
- Shared meter remains applied to text, image and delivered-video AI workflows; model discovery/configuration remains free.
