# PotHub current status

Only the following claims are backed by checks run for this archive:

- `server/app.js` and `server/lib.js` pass Node syntax checks.
- Static release audit passes.
- Six source-level regression tests pass for missing helper imports, explicit BYOK candidate routing, the `Readable` import, reservation ownership guards, and image settlement ordering.
- Available pure unit tests include successful coverage for billing policy, backup helpers, provider parameter helpers, URL safety, workspace vault helpers, and other isolated modules.

The full suite is **not passing in this environment**: 83 tests passed and 16 failed to load due to missing dependencies. Dependency installation timed out, and an offline lockfile attempt failed because registry metadata was not cached. No `package-lock.json` was generated. Do not claim a production build, live OAuth, live Flutterwave/Firebase/provider behavior, Capacitor build, or Android device test has passed.

Major requested audit areas A4-A11, B1-B9, C1-C4, D1-D8, and E1 remain partly or wholly unresolved as itemized in `FIX_REPORT.md`. This source package is an intermediate repair, not production-certified.
