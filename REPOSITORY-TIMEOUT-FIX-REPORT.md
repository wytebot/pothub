# PotHub GitHub repository timeout fix

## What the supplied screenshot establishes

The repository card displayed **16 available** while also showing a 35-second timeout. This means the UI already had a previously loaded repository list; the failed request was a refresh attempt, not proof that the GitHub account had zero repositories. The old UI misleadingly offered GitHub reconnection for every failure.

## Changes

- GitHub identity (`GET /user`) and first repository page (`GET /user/repos?...page=1`) now load concurrently instead of sequentially.
- Each GitHub API request has a 12-second abort deadline instead of 18 seconds.
- Repository discovery still verifies that the OAuth token belongs to the active GitHub account and has `repo`/`public_repo` scope.
- Additional pages are fetched only when the first page is full; discovery is bounded to five pages (up to 500 repositories) to fit the Vercel API function's 60-second maximum.
- The client timeout is 55 seconds and does not automatically replay a timed-out GitHub GET.
- On a transient timeout/rate-limit/network error, an already loaded repository list is retained and remains selectable. The UI says it is showing the last successful list and offers **Refresh repos**, not a misleading **Reconnect GitHub** action.
- Reconnection is only requested for an expired/invalid session, missing repository authorization, account mismatch, or organization SSO requirement. GitHub API rate limits do not trigger a reconnect prompt.
- The error state stays inline in the repository card; it does not trigger a blocking toast/modal.
- Added a tested bootstrap helper to verify identity and the first page are fetched concurrently and malformed API responses fail clearly.

## Validation

- `node --check` for all server, scripts and test JS/MJS files: PASS.
- TypeScript parser check for `src/ui/App.jsx` and `src/ui/WorkspaceSection.jsx`: PASS.
- GitHub repository/access focused tests: 7/7 PASS.
- Static release audit: PASS.
- Full test suite: 78 passed, 16 could not run because this environment has no installed `express`, `firebase-admin`, and `typescript` packages. These are dependency-availability failures, not passing tests.
- Live GitHub API behavior and the actual Vercel deployment have not been exercised from this build environment.

## Deploy

Replace the repository contents with this ZIP and redeploy. Then open Developer workspace and tap **Refresh repos** once. If the existing 16-item list is present, it should remain usable during a transient refresh failure. For missing private/organization repositories, reconnect only when PotHub explicitly reports a scope/SSO authorization issue.
