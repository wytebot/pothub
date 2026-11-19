# Pothub deployment and stale-site fix

## Active frontend entry points

Vercel builds this project from the repository root. `index.html` loads `/src/main.tsx`; that file mounts `src/App.tsx` and imports `src/styles.css`. The old duplicate root-level copies (`App.tsx`, `styles.css`, `pages/`, `agent/`, `models/`, `ui/`, `auth/`, `vault/`, `security/`) were removed in v0.3.0 so edits can only land in `src/`.

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


## Never serving an old version (v0.3.0)

Every build gets an id (the Vercel commit SHA, or a timestamp). The id is baked into the app (`__BUILD_ID__`), into `dist/version.json`, and into the service worker's cache name (`pothub-static-<id>`), so each deployment changes `sw.js` and the browser installs it and deletes the old cache. The app checks `/version.json` (served no-store) when it opens, when you return to it and every 10 minutes: right after opening it reloads itself onto the new version, and mid-use it shows an "Update now" notice so a running answer is never cut off. It reloads at most once per version, so it cannot loop. The Android APK carries its own files and skips this check; rebuild the APK to ship changes there.

## Server (billing service) changes in v0.4.0

- Image and video limits were removed; `/api/usage/reserve` now only confirms sign-in so older installed apps keep working.
- New Authenticated route `GET /api/search?q=` (3 daily searches for Free; up to 30 for Premium) looks the query up on DuckDuckGo (`server/src/search.ts`). DuckDuckGo has no official search API, so this reads its HTML results page and falls back to its Instant Answer API; if DuckDuckGo blocks or changes that page, the app tells the user web search was unavailable and still answers. Results are cached for 10 minutes in memory.
- Redeploy the server together with the front end. Free limits (10 attachments and 10 file analyses per 5 hours) live on the device.


## v0.5.2: backups, request routing, quality checks and memory

**Offline.** The service worker caches the app shell. Network requests still require connectivity; provider generation is not guaranteed to finish if the browser or Android process is terminated.

**File reading.** `src/agent/readers.ts` reads documents, sheets, slides, e-books, ZIP/TAR/GZIP archives, notebooks, RTF, PDFs (text layer), and attempts readable-string recovery for unknown binaries. 7z/RAR are not currently supported on-device. Unsupported or encrypted formats are reported rather than silently treated as fully read.

## Full backup and restore

The Storage page exports chat history, editing projects and saved media into a downloadable ZIP. Restore merges by stable record ID and timestamp: newer backup records update matching records, older versions do not overwrite newer local records, and unrelated local data is never cleared. Keep multiple copies of the ZIP outside the app.

Google Drive syncing has been removed. Backups are user-managed downloads; no cloud copy is created by Pothub.


**Request routing and QA.** Explicit image/video requests no longer fall back to a text answer when a media provider is unavailable. Text responses receive an independent request-compliance review; file-based answers are checked against extracted source evidence. Image/video outputs are checked for valid non-empty files before saving. This is structural QA, not a guarantee of semantic perfection.

**Conversation context.** Full history remains saved locally. Free requests include up to 8 recent exchanges from the current conversation; Premium includes up to 40. Editing a user request updates its existing assistant response in place.

**Web research.** Free accounts can use 3 searches per day (up to 3 results); Premium can use up to 30 searches per day (up to 8 results). The server enforces the allowance.
