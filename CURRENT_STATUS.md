# PotHub current status — 2026-11-01

This archive is an **intermediate source repair**, not a release-certified build.

## Checks actually run

- `node --check server/app.js` — passed after edits.
- `node --check server/lib.js` — passed after edits.
- `node --check scripts/stamp-service-worker.mjs` — passed before the final small edits; rerun as part of `npm run check`.
- `node --test tests/one-pass-regressions.test.mjs` — 14/14 passed. These are focused pure-logic/source-regression checks for auth domain, redirect restore, session token storage, repository names/branches, chat scope, composer handling, service-worker stamping and Capacitor API configuration.
- Initial `npm run check` on the incoming archive: static release audit passed, but full tests failed to load 16 test files because `express`, `firebase-admin`, and `typescript` were absent. `npm ci` could not run because no package-lock.json exists; `npm install --ignore-scripts` timed out. No dependencies were installed.

## Not certified

No production Next.js build, Capacitor export, Android device test, live Google/GitHub OAuth, Firebase Firestore integration, Flutterwave sandbox/webhook, or real provider API test was run. Many items in the requested A/B/C/D matrix remain incomplete; see `CHANGELOG.md` for per-ID evidence and exact scope. Do not deploy this archive as though all requested findings were fixed.
