# PotHub audit remediation — implementation pass

Date: 2026-10-31

This report records the current source tree. No live Flutterwave, GitHub, Firebase, AI-provider, Vercel or physical Android verification is claimed.

## Requested remaining issues

| Issue | Implementation / files changed | Test(s) | Status |
|---|---|---|---|
| A2 | Added a durable `ai_operations` state machine (`running/succeeded/failed`, payload hash, result, expiry) in `server/operation-state.js` and `server/lib.js`; wired diagnose, repair, chat, creator image and video delivery in `server/app.js`; stable chat operation IDs in `src/ui/App.jsx`; credit RPC wrappers in `server/credit-reservations.js`. Replays return stored results or in-progress; failed reservations can be released and retried. Client mode/workspace headers no longer set price. | `operation-state.test.mjs`; `credit-reservations.test.mjs`; `firestore-state-handlers.test.mjs` | IMPLEMENTED. Pure/concurrency wrapper tests pass. Firestore transaction integration test added but could not execute without installed Firebase dependencies. |
| A4 | Added stable HttpOnly `pothub_device_id`, server-derived HMAC device/IP signals, one-starter-grant-per-device claims and five-new-accounts-per-IP/UA/day limit. Applied the same `starterGrantEligibility` policy to GitHub and Google/Firebase auth; all paths return `starter_credits_remaining`. Files: `server/lib.js`, `server/starter-credit-policy.js`, `server/app.js`, `src/ui/App.jsx`, `firebase.json`, `ENVIRONMENT_VARIABLES.md`. | `starter-credit-policy.test.mjs`; `firestore-state-handlers.test.mjs` | IMPLEMENTED. Policy test and mocked Firestore test added; Firebase-backed test not executed in this dependency-less environment. Device cookie/IP policy still needs deployment abuse monitoring. |
| B5 | Migrated checkout UI to Flutterwave Standard hosted checkout; removed card/PAN/CVV/PIN collection and encryption from client; `/api/billing/config` no longer returns encryption keys; `/api/billing/authorize` remains disabled; fresh transaction-ID or `tx_ref` verification is server-side. Added PCI scope documentation. Files: `server/app.js`, `server/flutterwave-hosted.js`, `src/ui/App.jsx`, `docs/PCI_SCOPE.md`, `ENVIRONMENT_VARIABLES.md`. | `flutterwave-hosted.test.mjs`; `credit-reservations.test.mjs` | IMPLEMENTED. Mock-fetch and transaction-validation tests pass. PCI assessment and sandbox transaction remain live checks. |
| C4 | Added one absolute 48-second request deadline and deadline-aware provider/image timeouts; client timeouts for diagnose, repair, image and chat are 52 seconds. Files: `server/request-deadline.js`, `server/app.js`, `server/image-adapters.js`, `src/ui/App.jsx`. | `request-deadline.test.mjs` | IMPLEMENTED; deadline tests pass. Vercel execution ceiling still requires deployment verification. |
| C5 | Centralized OpenAI parameter shaping: reasoning models use `max_completion_tokens`, omit unsupported temperature and JSON response format; response format is only sent to supported provider families. Gemini JSON requests disable thinking budget. Files: `server/provider-params.js`, `server/app.js`. | `provider-params.test.mjs` | IMPLEMENTED; parameter tests pass. Live provider compatibility not claimed. |
| C7 | Added TypeScript compiler parser validation for JS, JSX, TS and TSX patches. Repair continues to fetch the exact target file, refuses truncated/oversized source, applies exact unique search/replace patches, validates JSON/source syntax and rejects drastic shrinkage. Files: `server/source-validation.js`, `server/app.js`, `package.json`. | `source-validation.test.mjs`; global `tsc --noEmit ... src/ui/App.jsx` | IMPLEMENTED. App JSX syntax check passes. Dedicated runtime parser tests were not executable because local npm dependencies could not be installed. |
| C10 | Images are stored as private Firebase Storage objects and returned as short-lived V4 signed URLs; added storage CORS config. Video delivery streams upstream response bodies and streams inline buffers rather than sending one buffered response. OpenAI image sizes now follow requested orientation/aspect family; Gemini image models are separated from text models and requested count is validated. Kling uses the documented new-model Bearer API-key header and only enables the documented Kling 3.0 model. Files: `server/signed-media.js`, `server/lib.js`, `server/app.js`, `server/image-adapters.js`, `server/video-adapters.js`, `src/lib/provider-registry.js`, `storage.cors.json`, `ENVIRONMENT_VARIABLES.md`. | `signed-media.test.mjs`; `video-integrations.test.mjs`; `kling-auth.test.mjs`; `provider-registry.test.mjs` | IMPLEMENTED at code level; unit tests pass. Storage IAM/CORS and real provider downloads require live checks. |
| D4 | Added Firestore-backed refresh lease acquisition/release; refresh is single-flight across instances and updates the existing browser session instead of creating another session/cookie. TTL added. Files: `server/distributed-lock.js`, `server/app.js`, `firebase.json`. | `distributed-lock.test.mjs` | IMPLEMENTED; lease concurrency test passes. Multi-instance Vercel behavior requires deployment test. |
| D5 | Added `onIdTokenChanged`, client-side ID-token refresh on expired session, one-time Firebase ID-token-to-opaque-session exchange, and read-only session lookup on normal Bearer requests. Exchange/session docs use `Timestamp`-compatible `Date` expirations and TTL. Files: `src/ui/App.jsx`, `server/lib.js`, `server/app.js`, `firebase.json`. | `firestore-state-handlers.test.mjs`; App JSX `tsc` syntax check | IMPLEMENTED. Mock Firestore test added but not executed because Firebase packages are absent locally. |
| E1 | Added DNS resolution checks, IPv4/IPv6 reserved-range checks including hexadecimal IPv4-mapped IPv6, pinned HTTPS socket lookup, no automatic redirects, redirect revalidation and provider CDN allowlists. User-configured endpoint calls and provider asset downloads use the pinned fetch path. Files: `server/url-safety.js`, `server/app.js`, `server/image-adapters.js`, `server/video-adapters.js`. | `url-safety-pinning.test.mjs`; `security-regressions.test.mjs` | IMPLEMENTED; IP/DNS policy tests pass. No live DNS-rebinding lab test was run. |
| F2 | Vercel CLI is pinned to `41.7.2` in `.github/workflows/vercel-production-deploy.yml`; TypeScript was moved to runtime dependencies because the API imports its parser. | Workflow/package inspection | CODE-WIRED; EXECUTION PENDING: added `.github/workflows/generate-package-lock.yml` to resolve dependencies on GitHub Actions, validate with `npm ci`, and upload the complete lockfile artifact. Production deploy workflow now generates a lock, proves a clean install, and uploads the lock artifact. Vercel CLI remains pinned to `41.7.2`. This workspace cannot resolve `registry.npmjs.org` (`EAI_AGAIN`), so no fabricated lockfile was added. |
| F3 | Replaced source-grep tests with real helper/handler tests; added mocked RPC reservation/commit/release concurrency, mocked Firestore operation/session/lease tests, real Express CORS preflight tests across route groups, malformed-body/error-handler test, webhook forged-signature/stale-replay test and idempotent grant replay test. Files under `tests/`. | `credit-reservations.test.mjs`; `firestore-state-handlers.test.mjs`; `cors-handlers.test.mjs`; `api-paths.test.mjs`; `async-route-safety.test.mjs`; `webhook-handler.test.mjs`; `handler-safety-regressions.test.mjs` | CODE-WIRED; EXECUTION PENDING: production workflow runs the full suite after a clean install and blocks deployment on failure. Local full handler suite remains blocked because registry DNS failed and dependencies are absent. |

## Outstanding environment blockers — workflow wiring added

A manual GitHub Actions workflow (`Generate Pothub npm lockfile`) now resolves the dependency graph on a networked runner, runs a clean `npm ci`, and uploads a complete lockfile artifact. The production deployment workflow performs the same install/clean-install sequence, runs the full test suite, checks both web and Capacitor builds, and only then deploys. This closes the automation gap but does not pretend a lockfile was produced in this offline workspace. After the workflow completes, download the `pothub-package-lock` artifact and commit `package-lock.json` to the repository; subsequent builds will use the committed lockfile.

The missing PDF.js worker is a downstream symptom of the absent `node_modules` install: both build scripts copy `pdfjs-dist/legacy/build/pdf.worker.mjs` from the installed package. The new CI sequence installs and verifies the package before either build. If that step fails on GitHub Actions, deployment is blocked and the actual error is surfaced rather than shipping a broken artifact.

## Verification executed

- `node --check` over all JS/MJS files under `server/`, `scripts/`, and `tests/`: PASS.
- `tsc --noEmit --allowJs --checkJs false --jsx preserve --noResolve --skipLibCheck --target ES2022 --module ESNext src/ui/App.jsx`: PASS.
- Dependency-independent unit subset: **49 passed, 0 failed**.
- `npm run check`: release audit passed; full Node test run could not complete because required npm packages are not installed (53 passed, 16 failed with missing-module errors at the final run).
- `npm install --no-audit --no-fund --fetch-retries=0 --fetch-timeout=10000`: TIMEOUT; direct registry probe returned `EAI_AGAIN` for `registry.npmjs.org`; no `package-lock.json` created locally.
- `npm run build`: FAIL — missing `node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs` (dependency installation unavailable).
- `npm run build:cap`: FAIL — same missing PDF.js worker/dependencies; no production export was generated.

## Live/manual verification still required

1. Run GitHub Actions → **Generate Pothub npm lockfile**, download its `pothub-package-lock` artifact, and commit `package-lock.json`. The production workflow also generates/uploads a lockfile and blocks deployment unless `npm ci`, tests, web build, and Capacitor export pass.
2. Deploy Firestore TTL indexes/policies from `firebase.json`; test stale reservation cleanup and daily starter-IP counters against a real Firestore project.
3. Run two simultaneous Vercel instances against one account to validate refresh lease behavior and session rotation.
4. Test Firebase redirect/token refresh and one-time exchange in browser and Capacitor Android.
5. Test Flutterwave sandbox hosted checkout, `tx_ref` reconciliation, transaction-ID verification, webhook signature/replay and duplicate credit grant.
6. Apply `storage.cors.json` to the Firebase Storage bucket; verify service-account object-write and V4 signed-URL permissions.
7. Test Gemini/OpenAI image models, Kling 3.0, Runway, Luma, Replicate and Fal using real provider credentials; confirm each provider's current response and CDN host.
8. Test DNS-rebinding and redirect cases against a controlled DNS lab; test video streaming and client disconnect/retry on a deployed Vercel function.
9. Run all newly added Express/Firestore integration tests after dependency installation, then install the APK on a physical Android device and verify OAuth, CORS, signed image fetches and video streaming.

## Production crash follow-up — 2026-10-31

- **Reported runtime error:** `ReferenceError: native is not defined` while rendering the workspace.
- **Root cause:** `src/ui/WorkspaceSection.jsx` referenced `native` in the Vercel-panel conditional, but the component did not destructure `native` from its `ctx` prop. The check also treated the function as a boolean instead of invoking it.
- **Fix:** destructure `native` from `ctx` and use `!native()` so browser users see the Vercel panel while native Android users do not.
- **Validation:** `tsc --noEmit --allowJs --checkJs false --jsx preserve --noResolve --skipLibCheck --target ES2022 --module ESNext src/ui/WorkspaceSection.jsx` passed; `node --check server/app.js` passed.
- **Deployment note:** this fixes the source project only. The production URL must be redeployed from this ZIP before the live crash is resolved. The live deployment could not be fetched from this environment to verify its post-deploy behavior.


## Developer workspace and API-page follow-up (2026-10-31)

- Fixed the mobile Developer menu: it now opens a visible navigation drawer with a scrim and closes after navigation.
- Added an explicit **Back to workspace** action to the API & Agents page, including its unlocked page header.
- Fixed API-page biometric/PIN security requests to send the active Pothub bearer session (native secure storage on Android; sessionStorage on web) as well as cookies. A 401 now explains that the Pothub session expired instead of showing an unhelpful sign-in prompt.
- Developer sign-in now automatically discovers repositories. The GitHub endpoint requests all visibility types and owner/collaborator/organization-member affiliations, paginates up to 1,000 repositories, deduplicates them, and returns clearer 401/403 organization/SSO errors. GitHub OAuth now requests `read:org` in addition to `repo`, `read:user`, and `user:email`.
- Removed the Vercel diagnostics OAuth integration and its `/api/vercel/*` routes/callback URI. Vercel remains the deployment host; no separate Vercel OAuth redirect URL is required by this app.
- All repository/provider pickers remain Pothub-rendered custom dropdowns. Error notices are now fixed, bounded, scrollable, auto-dismissing toasts that do not reflow the workspace viewport.
- Local syntax and build checks are listed in the delivery response; live GitHub OAuth, organization SSO, WebAuthn and production behavior still require deployment verification.


### Corrections to the earlier Vercel diagnostics scope

The previous Vercel diagnostics OAuth/callback implementation is now deliberately removed from the application. Vercel remains the hosting/deployment platform and GitHub Actions/Vercel deployment workflows are not removed. The old D4 Vercel refresh-lock item is therefore obsolete for the current product surface; no Vercel OAuth redirect URL or Vercel OAuth client secrets are required by Pothub.
