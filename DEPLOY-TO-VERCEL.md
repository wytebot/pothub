# Deploy Pothub to Vercel

## Fix for Vercel looking for `dist`

This project is a normal Next.js deployment, not a static `dist` export. `vercel.json` explicitly sets `framework` to `nextjs` and `outputDirectory` to `.next`, which overrides a stale `dist` output-directory setting. Keep the Vercel Root Directory pointed at the repository root containing `package.json`, `pages/`, and `vercel.json`, then redeploy the latest commit. The Capacitor build remains a separate script.
 (frontend + API on the same origin)

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


## API handler and authentication diagnostics

The Next.js API catch-all (`pages/api/[...path].js`) lazily imports the Express app and returns JSON if backend initialization fails. It disables Next.js body parsing for Express and enables `externalResolver`. `/api/health` always returns JSON with the status of `APP_URL`, `FRONTEND_URL`, `GITHUB_CLIENT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, and `SESSION_SECRET`. Explicit `APP_URL` and `FRONTEND_URL` values are recommended for production; if absent, OAuth URLs fall back to the current request host (HTTPS in production).

`FIREBASE_SERVICE_ACCOUNT_JSON` may contain the service-account JSON or a base64-encoded JSON document. The backend captures Firebase initialization errors instead of throwing during module import. A route that needs Firebase returns a JSON configuration error; invalid Google ID tokens return HTTP 401 JSON. Register the exact GitHub OAuth callback reported by `/api/health` in the GitHub OAuth App settings.

## Function duration and asynchronous media

Video creation is submitted as a short request and stored as an owner-bound Firestore job; the client polls status and downloads only after completion. BYOK keys are never stored for a background worker. Video result streaming still runs inside the Next.js catch-all function, so its transfer duration is bounded by the Vercel Function Max Duration configured for the project. Current Vercel documentation lists Hobby up to 300 seconds with Fluid Compute enabled, versus up to 60 seconds when Fluid Compute is disabled; verify the actual project setting before large downloads. Keep provider submission/status requests short and do not hold a request open while the provider generates the video.
