# Pothub: recover deployments when Vercel stops reacting to Git pushes

This workflow deploys the checked-out repository to the linked Vercel production project from GitHub Actions. It does not require Vercel's automatic Git deployment trigger to work, but it does require the correct Vercel project credentials.

## Important: place source files at the repository root

Commit the **contents** of this folder into the root of the GitHub repository connected to Pothub. Do not commit only this ZIP, and do not leave `package.json`, `vercel.json`, `api/`, `server/`, and `src/` inside an extra `pothub-work/` or other nested folder unless Vercel/GitHub Actions are deliberately configured to use that folder as the project root.

## Add these GitHub Actions secrets

Open the repository on GitHub → **Settings → Secrets and variables → Actions → New repository secret** and add:

- `VERCEL_TOKEN`: create a token in Vercel account settings.
- `VERCEL_ORG_ID`: find the team/account ID in Vercel team settings or the project's `.vercel/project.json` after linking the project locally.
- `VERCEL_PROJECT_ID`: the Pothub project's ID, also available in `.vercel/project.json` after linking.

Never put these values in source code or commit them to the repository.

## Run it

1. Commit and push these files to `main` or `master`, or open GitHub → **Actions** → **Deploy Pothub to Vercel Production** → **Run workflow**.
2. Open the workflow run. It shows whether dependency install, tests, Vercel build, or deployment failed.
3. A successful run prints the production deployment URL. Test `/api/health` and `/api/auth/github` on that URL.

## If the workflow fails

- `npm ci` fails: the lockfile may not match `package.json`; fix that before deploying.
- `npm run check` fails: source checks/tests have found a code issue; do not bypass them without reviewing the failure.
- `vercel pull` reports project not found or authorization failure: `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, or `VERCEL_TOKEN` is incorrect or the token lacks access.
- Build succeeds but the website is still old: verify the URL printed by the workflow is the same production domain assigned to `pothub-self.vercel.app`.

This workflow is a deployment fallback, not proof that the existing Vercel Git integration is repaired. It also does not create missing OAuth credentials or environment variables; the Vercel project must already contain the app's production environment variables.
