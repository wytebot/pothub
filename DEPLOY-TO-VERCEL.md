# Deploy this ZIP to Vercel (important root-directory fix)

The Vercel error `ENOENT: /vercel/path0/package.json` happens before Next.js starts. It means Vercel is building a Git commit/root directory where `package.json` is absent. Changing environment variables cannot fix it.

## Correct repository layout

Extract this ZIP and commit its **contents** to the root of `wytebot/pothub` on the `main` branch. Do not commit the ZIP itself, and do not put all project files inside an extra `pothub-nextjs-migration-clean/` folder unless you configure Vercel's Root Directory to that folder. These files must sit side by side at the configured root:

- `package.json`
- `next.config.mjs`
- `vercel.json`
- `pages/`
- `api/`
- `server/`
- `src/`

This archive is already structured with those files at the archive root.

## Vercel settings

In **Project → Settings → Build and Deployment**:

- Root Directory: `.` (repository root; leave the field empty if Vercel treats that as the root)
- Framework Preset: `Next.js`
- Build Command: `npm run build`
- Install Command: `npm install`
- Output Directory: `out`

If Vercel's Root Directory points to a different folder, change it to the directory containing `package.json`.

## Confirm before redeploying

1. Open GitHub `wytebot/pothub` and select branch `main`.
2. Confirm `package.json` is visible at the repository root, not just inside a ZIP or nested folder.
3. Commit/push this migrated project so Vercel builds the new commit. The previous build log used commit `5b44533`; redeploying that same old commit will repeat the error.
4. In Vercel's deployment log, confirm the commit hash changed and dependency installation gets past `npm install`.

Do not add fake `package.json` files or change environment variables to work around this error. The actual source commit or Root Directory must be corrected.
