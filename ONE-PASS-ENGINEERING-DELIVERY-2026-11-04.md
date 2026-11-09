# PotHub one-pass engineering delivery — 2026-11-04

## Scope of this archive

This archive is the supplied PotHub source plus a deployment/verification hardening patch. It is **not** a claim that every item in the full product brief has been implemented or device-tested. The source already contains a number of the requested foundations (repository-scoped Codelab claims, a bounded read-only planner/tool loop, SSE endpoints, resumable job event streams, GCS resumable uploads, credit reservations, encrypted workspace vault, SSRF checks, signed media, and the native PublicDownloads bridge). Their presence in source does not prove their full end-to-end behavior.

## Changes made in this pass

- Made the lockfile workflow use Node 24, matching `package.json`'s declared engine.
- Changed the manually triggered lockfile workflow to validate with `npm ci` and commit `package-lock.json` back to the selected branch when it changes, instead of leaving the artifact as a manual step.
- Changed production CI to use Node 24 and require a committed `package-lock.json`; it now uses `npm ci` rather than mutating dependency resolution during deployment.
- Kept the existing Vercel production workflow gated on source checks/tests, Next.js build, and Capacitor export before deployment.

## Migration / operator steps

1. Push this archive's source to the intended GitHub branch (normally `main`).
2. In GitHub, open **Actions → Generate and commit PotHub npm lockfile → Run workflow**. It will resolve dependencies on a networked runner, run a clean install, and commit the lockfile if successful.
3. Confirm `package-lock.json` is present at the repository root.
4. Add GitHub Actions secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` if using the supplied CI deploy workflow. The workflow must have permission to deploy to the intended Vercel project.
5. Set Vercel Root Directory to the directory containing this root `package.json` (for this archive, the repository root after extraction). The earlier ENOENT log refers to the deployed commit/configuration, not the contents of this ZIP alone.
6. Apply `storage.cors.json` to the Firebase Storage bucket and keep the production origin list aligned with the deployed app origin. The Capacitor WebView origin `https://localhost` is already listed.
7. Build and install a fresh Android APK before evaluating native file downloads, SecureStorage, OAuth deep links, hardware back, status bar, or biometrics.

## Verification report

### Verified in this environment

- The uploaded ZIP was extracted successfully; it contains a root `package.json` and 571 archive entries.
- `node --check server/app.js` and `node --check server/lib.js` pass (they are part of `npm run check`).
- `node scripts/release-audit.mjs` passes its static source audit.
- The existing path-policy regression test includes `src/distance.js`, `src/builder.ts`, `src/coverage-utils.js`, and `src/my-secretary.js` as paths that must not be excluded by substring matching.
- The existing source contains a Codelab planner route, persisted scope validation, read-only tool execution, an SSE chat path, resumable job event SSE, resumable Firebase Storage upload initiation, credit reservation helpers, encrypted workspace-vault code, URL-safety helpers, signed media helpers, and the native PublicDownloads plugin.
- The ZIP's root is structurally suitable for Vercel when committed at repository root; `package.json` is not nested in a subfolder in this archive.

### Not verified / currently blocked

- `package-lock.json` could not be generated locally because dependency resolution timed out in this environment. The new GitHub workflow is intended to generate and commit it on a networked runner; that workflow has **not** been run here.
- `npm run check` is **not green** in this environment: 203 tests passed and 25 test files failed to load because dependencies are not installed (`express`, `firebase-admin`, `typescript`, and other declared packages). These are not counted as successful tests.
- `npm ci`, `next build`, `npm run build:cap`, Android debug build, GitHub Actions execution, and Vercel deployment were not completed here.
- Live Google/GitHub/Vercel OAuth, Firebase Storage CORS and signed uploads, provider calls, Flutterwave checkout/webhook replay, real account isolation, SSE reconnection under a 60-second serverless timeout, and physical Android testing were not run.
- The complete UI/design checklist (welcome animation, all gestures, all file types at >50 MB, screen-reader/AA checks, Lighthouse, bundle budgets, offline/resume, and every generation provider lifecycle) is not certified by this patch.

Do not interpret a source audit or passing unit tests as proof of end-to-end product readiness. Deployment should remain blocked until the networked CI workflow passes.
