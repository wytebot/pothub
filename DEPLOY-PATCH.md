# PotHub deployment visibility patch (2026-11-04)

This is a **patch-only ZIP**. It intentionally contains only files affected by this correction:

- `server/app.js`
- `tests/payment-ai-hardening.test.mjs`

## Apply it correctly

1. Download and extract this ZIP.
2. Copy the `server/` and `tests/` directories into the **root of the exact GitHub repository and branch connected to Vercel**, overwriting the existing files. Do not upload the ZIP as a nested folder and do not copy only the test file.
3. Commit and push the changes. Confirm the commit appears in the Vercel deployment details.
4. After deployment, open `https://YOUR-PRODUCTION-HOST/api/version`.
5. Confirm JSON includes `sourceRevision: "pothub-no-video-agent-message-2026-11-04-r2"`.

If the marker is absent, this patch is not the source being served. Check the Vercel project's Git repository, production branch, Root Directory (must contain `package.json`, `pages/`, and `server/`), and the deployed commit SHA. Redeploy the correct commit after correcting those settings.

The patch does not change Vercel project settings and cannot push/commit to your GitHub repository on your behalf.
