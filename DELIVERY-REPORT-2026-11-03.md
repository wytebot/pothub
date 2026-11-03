# Delivery report — 2026-11-03

## Artifact status

This archive is a **partial hardening pass**, not a production certification. It contains the source tree, root-cause changelog, pricing review and manual QA checklist. The full acceptance request is not complete; known blockers are listed in `CHANGELOG-HARDENING-2026-11-03.md`.

## Verification performed

- `node --check server/app.js` — passed.
- `node --check server/lib.js` — passed.
- `node --check server/model-catalog.js` — passed.
- `node --check src/lib/request-planner.js` — passed.
- Follow-up request-planner tests — passed after adding direct drawing/video intent coverage.
- `node --check src/ui/App.jsx` is not available via bare Node because Node does not parse `.jsx` directly; the production build is still blocked before JSX compilation by the missing PDF.js worker.
- `node scripts/byok-repo-audit.mjs` — passed (200 files scanned).
- `node scripts/release-audit.mjs` — passed (static audit only).
- `npm run pricing:check` — passed; all four packs clear 50% gross margin plus the 0.5 percentage-point buffer under the stated placeholder assumptions.
- Earlier focused suite: 40 tests passed across request planning, BYOK routing, pricing, provider health, model catalog, provider capability filtering and retired-model normalization. After the follow-up workspace/task isolation edits, the selected regression suite passed 27/27 tests.
- Full suite: 221 tests discovered, 205 passed and 16 failed because required packages (`express`, `firebase-admin`, `typescript`, and others) were unavailable after dependency installation timed out. These are environment/dependency failures, so the full suite cannot be called green.
- JSX syntax parsing via the globally available TypeScript transpiler — passed for `src/ui/App.jsx`, `src/ui/AgentsWorkspace.jsx`, and `src/ui/WorkspaceSection.jsx`. `node --check server/app.js` and the BYOK/pricing audits passed after the follow-up edits.
- `npm run build` — blocked before Next.js compilation because the PDF.js worker is missing; the dependency install did not complete. No production build or Capacitor build was verified.

## Deployment warning

Legacy platform-owned AI key variables are ignored for inference and produce a warning only; they no longer block application startup. Remove them from Vercel Production, Preview and Development when convenient. All AI inference must still use keys saved on user-configured agents.

## Manual QA still required

Use `MANUAL-QA-BYOK.md`. In particular, validate actual image/video output with real user-owned provider credentials, both workspace roles, key leakage across the browser and sync boundary, Android WebView keyboard behavior, payment ledger behavior, and Vercel/Capacitor builds.


## Final follow-up verification — 2026-11-03

- Focused routing/planner/pricing suite: 27/27 passed. Additional source regressions for Creator/Developer routing, workspace UI separation, composer sizing and provider model normalization passed in focused runs.
- Full suite: 221 discovered, 205 passed, 16 failed. The 16 failing test files could not load required dependencies in this environment (for example `express`, `firebase-admin`, and security/route dependencies); therefore the suite is not green.
- Static checks: server/lib syntax, JSX parse for the changed components, BYOK repository audit, pricing margin check and release audit passed.
- Production build and Capacitor build remain unverified because the PDF.js worker was unavailable after dependency setup failed.
- Workspace scope is now represented and filtered in UI/request candidates, but the server does not yet resolve agent IDs against a server-owned registry. Treat this as a defense against accidental cross-workspace selection, not a complete security boundary.
