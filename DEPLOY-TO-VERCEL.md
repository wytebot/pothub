# Deploy Pothub to Vercel (frontend + API on the same origin)

Pothub must be deployed as a normal **Next.js** application, not a static export. The previous `output: 'export'` plus `outputDirectory: 'out'` configuration could cause Vercel to serve only the static frontend while `/api/*` returned a platform HTML 404. That prevents Developer sign-in and Google Creator workspace setup from completing.

## Repository layout

Commit the **contents** of this archive to the root of `wytebot/pothub` on `main`. Do not commit the ZIP itself or put all files in an extra nested folder. These paths must be at the configured root:

- `package.json`
- `next.config.mjs`
- `vercel.json`
- `pages/` (including `pages/api/[...path].js`)
- `server/`
- `src/`

## Vercel settings

In **Project → Settings → Build and Deployment**:

- Root Directory: repository root (`.` / empty)
- Framework Preset: **Next.js**
- Build Command: `npm run build`
- Install Command: `npm install`
- Output Directory: leave default/override disabled; do **not** set it to `out`

The Next.js API catch-all at `pages/api/[...path].js` forwards all `/api/*` requests to the shared Express backend. It preserves the existing API endpoints and keeps browser OAuth callbacks on the same deployed origin. Do not restore the old root `api/` folder or static-export setting.

## Verify after deployment

1. Confirm the deployment is for the new commit and the build succeeds.
2. Open `https://YOUR-HOST/api/health`. It must return JSON from Pothub, not an HTML Vercel 404/405 page.
3. Open `https://YOUR-HOST/api/auth/github`. In a browser it should start the GitHub authorization redirect (or show a clear JSON/configuration error if OAuth environment variables are missing), not a platform 404.
4. Test Developer login from the browser; after GitHub consent it should return to Pothub and open Developer workspace.
5. Test Google login; after Google consent it should establish the backend session and open Creator workspace. Test a refresh to ensure `/api/auth/me` restores the session.

A passing local test suite cannot prove Vercel deployed the new commit or that provider credentials are valid. If `/api/health` is still HTML, inspect the Vercel deployment's commit and Root Directory before changing OAuth credentials.
