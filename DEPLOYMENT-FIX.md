# Pothub deployment and stale-site fix

## Active frontend entry points

Vercel builds this project from the repository root. `index.html` loads `/src/main.tsx`; that file mounts `src/App.tsx` and imports `src/styles.css`. The root-level `App.tsx` and `styles.css` are legacy files and are not used by the Vite web build. Make browser-app changes under `src/` unless you intentionally change the Vite entry point.

## Vercel settings

- Root directory: `./` (repository root)
- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main` (or the branch intentionally connected to Production)

The build command now runs TypeScript validation before Vite emits `dist/`.

## Updating from a ZIP

Do not upload the ZIP itself as a single file and expect Vercel to unpack it. Extract the ZIP and commit its **contents** into the connected GitHub repository, preserving the root layout (`package.json`, `index.html`, `src/`, `public/`, and `vercel.json` must be at repository root). Push the commit to the branch configured for Vercel Production. Then verify that the Production deployment's commit SHA matches the new GitHub commit and that the build succeeds.

## Cache behaviour

The deployment sends no-store/no-cache headers for the HTML entry and service worker. The service worker was versioned to `pothub-static-v4`, uses network-first navigation, does not intercept Firebase auth or `/api/`, and checks for an updated worker when the page loads. If an installed PWA still displays an old shell after deployment, close it fully and reopen; if needed, clear the site's stored data/service worker once from browser site settings.

## Verification limitation

The source ZIP and JSON configuration were inspected. Dependency installation timed out in the execution environment, so a complete `npm run build` and live Vercel deployment could not be verified here. Vercel's deployment log remains the authoritative check for the actual production build.
