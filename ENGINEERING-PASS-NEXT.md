# PotHub Engineering Pass — Approved multi-commit delivery

## Implemented in this pass

- Expanded `/api/github/agent/commit-approved` from at most 12 files in one commit to at most 80 files delivered in batches of 12 commits/files per Git Data API commit.
- Kept the explicit `approved: true` gate and expected-base-SHA conflict check before any write.
- Added UTF-8 and base64 blob support so binary-safe payloads can be represented without forcing every file through text decoding.
- Caps the decoded change set at 2.5 MB per request, each file at 50 MB review limit (100 MB hard safety limit is documented, though the request cap is intentionally stricter), and rejects path traversal, duplicate paths, generated directories, likely secret paths, invalid JSON and syntactically invalid JS/TS.
- Creates a dedicated `pothub/agent-*` review branch. The default branch is never updated by this endpoint. If a later batch fails, the error indicates that a partial review branch may need cleanup.
- Adds targeted source-level regression tests for batch limits, base SHA checking, base64 support and partial-failure reporting.

## Deploy notes

- Replace the project files at the root of the repository connected to Vercel; do not nest them under another folder.
- Deploy from a branch and verify the deployment commit hash before testing the new endpoint.
- The client must submit `approved: true`, `expectedBaseSha`, `baseBranch`, `commitMessage`, and `files`; binary file objects use `{ path, content: base64, encoding: 'base64' }`.
- The request remains bounded to 2.5 MB decoded data and the Express JSON parser is 4 MB. This is **not** a signed-upload/resumable >50 MB transfer implementation.

## Verified in this environment

- `node --check server/app.js`
- `node --check src/lib/platform.js`
- 13 targeted tests passed: commit-policy tests, path-policy tests, GitHub access policy tests and credit reservation tests.
- `node scripts/release-audit.mjs` passed (static audit only).
- `node scripts/pricing-check.mjs` passed its configured 50% target under the current stated assumptions.

## Not verified / still outstanding

- Full `npm test`, `npm ci`, `next build`, Capacitor export, Android debug build; package registry/dependencies were not available in this environment.
- Live GitHub API behavior, OAuth, branch/commit creation, PR creation, live Vercel deployment and device behavior.
- Signed Storage upload URLs, resumable/chunked large-file upload, durable resumable agent jobs/SSE, immutable Codelab scope claims, full account linking, and the complete planner/tool loop.
- Full binary preview/download round-trip, >50 MB browser/APK downloads, image/video provider workflows and end-to-end credit refund testing.

Do not report these outstanding items as complete until they have been implemented and exercised in CI or against a test account/device.
