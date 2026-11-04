# PotHub principal engineering pass — 2026-11-03

This ZIP starts from the supplied `pothub-main (2).zip`. It is a bounded source pass, not a claim that the entire requested product redesign is complete.

## Implemented in this pass

- Added `server/path-policy.js`, a shared repository-relative path policy. Directory exclusions are segment-based (`dist/`, `build/`, `coverage/`, `node_modules/`, `.next/`, etc.) so names such as `src/distance.js` are not excluded accidentally. Applied it to repository planning, file listing/reading, patch proposals and commit/delete validation.
- Changed GitHub feature gates to check whether a GitHub token is actually linked, rather than rejecting an account solely because `authProvider` says Google. Creator chat/media routes now require a signed-in user rather than the login provider label. This is only a capability-gate improvement; it does not implement the full account-linking UX/data migration.
- Added opt-in GitHub OAuth workflow scope: default scope remains `repo read:user user:email`; `/api/auth/github?workflow=1` requests `workflow`. Commit endpoints check the granted `x-oauth-scopes` header before accepting changes under `.github/workflows/`.
- Added a single `saveFile(source, name, mime)` entry point in `src/lib/platform.js`, retaining `saveBlob()` as a compatibility wrapper. Browser downloads use a temporary object URL; native downloads use PublicDownloads in chunks with a bounded Filesystem fallback.
- Updated Storage CORS to explicit known app/local origins and added the Firebase Storage, Google auth and Vercel API hosts to Capacitor `allowNavigation`.
- Updated server-priced credit allowances to Starter 120, Developer 350, Professional 700, Power 1400. The cost model now explicitly sets platform-funded AI cost to zero for BYOK-only operation and labels $0.05/order as an unmeasured infrastructure planning estimate. `pricing:check` passes its configured 50% target under the current assumptions.
- Added regression tests for path filtering and credit-pack/margin assumptions.

## Migration / deployment notes

1. Deploy the exact root contents of this ZIP to the Git branch Vercel builds.
2. If a user needs to modify GitHub Actions workflow files, have them reconnect using `/api/auth/github?workflow=1`; normal GitHub connection does not request the workflow scope.
3. Apply the Storage CORS configuration with the Google Cloud Storage CORS command for the actual bucket. CORS is not applied merely by adding the JSON file to the repo. Add any production custom domain you actually use to the origin list before applying.
4. The $0.05 infrastructure/order value is a planning estimate, not measured telemetry. BYOK means provider charges are paid by the user; confirm this matches every enabled media/provider workflow before selling credits.
5. A real `package-lock.json` could not be generated here: `npm install --package-lock-only --ignore-scripts --offline` failed because the npm cache has no package metadata. Do not fabricate a lockfile. Run `npm install --package-lock-only --ignore-scripts` in a network-enabled environment, commit the resulting lockfile, then use `npm ci` in CI.

## Still outstanding — do not treat as complete

- A true server-side planner/tool loop that executes ordered tools, emits SSE, and resumes durable async jobs across Vercel's execution limit.
- Signed Firebase Storage resumable uploads wired from UI to server, replacing large JSON/base64 attachment bodies. The 4 MB JSON parser is still present; the CORS configuration alone does not implement uploads.
- Immutable owner/repo/branch scope claims bound to every Codelab chat request and server-enforced tool call scope.
- Full Google identity with linked GitHub/Vercel OAuth accounts and complete linking/unlinking/re-auth flows. This pass only removes provider-label gates where token capability is the actual authorization fact.
- Multi-commit, binary-safe large-file Git Data API uploads and UI review/virtualization for hundreds of files. Existing commit routes still have bounded request/file limits; do not use them for >3 MB payloads.
- Full job lifecycle verification for every image/video provider, server-side resumable job orchestration, signed URL refresh, and download tests for all requested file types above 50 MB.
- Full chat-first redesign, all gestures/actions, model sheet, message action menus, settings typography controls, and mobile/desktop parity acceptance tests.
- Production build, Capacitor export, Android debug build, live OAuth/payment/storage tests, GitHub Actions build verification and browser/APK end-to-end tests.

## Verification results observed here

- `node --check server/app.js`: passed.
- `node --check server/path-policy.js`: passed.
- `node --check src/lib/platform.js`: passed.
- `node --test tests/path-policy.test.mjs tests/pricing-pack-policy.test.mjs`: 4 passed, 0 failed.
- `node scripts/pricing-check.mjs`: passed after the BYOK-only pricing adjustment; $0.05 infrastructure cost is still only an estimate.
- `node scripts/release-audit.mjs`: passed. Static audit only.
- `npm test`: 185 passed, 26 failed because required packages were not installed (including Express, Firebase Admin and TypeScript); this is not a green full suite.
- `npm install --package-lock-only --ignore-scripts --offline --no-audit --no-fund`: failed with `ENOTCACHED`; no package-lock was generated.
- `npm run build`, `npm ci`, Capacitor export, Android debug build, live services and real-device tests: not run / not verified.
