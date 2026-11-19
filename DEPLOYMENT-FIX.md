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
- New Premium-only route `GET /api/search?q=` looks the query up on DuckDuckGo (`server/src/search.ts`). DuckDuckGo has no official search API, so this reads its HTML results page and falls back to its Instant Answer API; if DuckDuckGo blocks or changes that page, the app tells the user web search was unavailable and still answers. Results are cached for 10 minutes in memory.
- Redeploy the server together with the front end. Free limits (10 attachments and 10 file analyses per 5 hours) live on the device.


## v0.5.0: Google Drive sync, offline mode, universal file reading

**Google Drive sync (no Firestore).** Chats, projects and media are copied to each user's own hidden Drive app folder (`appDataFolder`, scope `drive.appdata`). Do these once in Google Cloud for project `pothub-ca2a1`:
1. Enable the **Google Drive API** (APIs & Services -> Library).
2. In **Google Auth Platform -> Data access**, add the scope `.../auth/drive.appdata` (a non-sensitive scope, so no Google review is needed).
3. Optional, web only: set `VITE_GOOGLE_CLIENT_ID` (the web OAuth client Firebase uses for Google sign-in) so the browser renews its Drive token quietly instead of asking the user to reconnect each hour. The Vercel origin must be an authorised JavaScript origin on that client. Without it, web users tap "Connect Google Drive" after the hour is up. The Android app asks through its own Google sheet.
New sign-ins ask for the Drive permission up front; people who were already signed in tap "Connect Google Drive" once in Account and Billing. I could not test against a real Drive here, so try it with two devices after deploying.

**Offline.** The service worker now saves every built file at install (list injected by `vite.config.ts`), so the app opens offline after the first visit. Requests wait for the connection and resume by themselves: `src/models/online.ts`, `models/http.ts`, and `drive()` in `models/text.ts` (an answer that was streaming continues from where it stopped).

**File reading.** `src/agent/readers.ts` turns documents, sheets, slides, e-books, archives (zip/tar/gz, nested), notebooks, RTF, PDFs (text layer, via `pdfjs-dist`, loaded only when a PDF is attached) and even unknown binaries (readable-strings scan) into text before any model is chosen. Only photos, scanned PDFs and (on Gemini) video/audio go to the provider as they are. Video is otherwise reduced to frames. 7z/RAR cannot be opened on-device. Run `npm install` to pick up `pdfjs-dist`.
