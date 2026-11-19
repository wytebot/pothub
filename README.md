# Pothub (formerly AI Creative Studio)

## Build 6: Google sign-in and live workflow
**Sign-in (Firebase project `pothub-ca2a1`)** - Browser/PWA: full-page Google account chooser via Firebase `signInWithRedirect`; Vercel proxies `/__/auth/*` to the Firebase auth helper on the same origin to avoid Chrome third-party storage partitioning. Android APK: native Google account sheet via `@capacitor-firebase/authentication` with `skipNativeAuth`, then the idToken signs the Firebase JS SDK in, so both share one user. Optional: signed-in users get their premium licence saved to their account and restored on a new device (`/api/account/link`, `/api/account/license`, verified with the Firebase Admin SDK).

**Google OAuth setup for the Vercel PWA** - In Firebase Authentication, add `pothub-self.vercel.app` under Authorized domains. In the Google OAuth client used by Firebase Authentication, add the exact authorized redirect URI `https://pothub-self.vercel.app/__/auth/handler` (keep the existing `https://pothub-ca2a1.firebaseapp.com/__/auth/handler` too). The app config automatically uses `pothub-self.vercel.app` as `authDomain` on that host, and `vercel.json` proxies the `/__/auth/*` helper endpoints. Do not set `VITE_FIREBASE_AUTH_DOMAIN` back to `pothub-ca2a1.firebaseapp.com` for this production PWA. After deploying, close the installed PWA completely and reopen it so the updated service worker is activated.

One-time Firebase console setup:
1. Authentication > Sign-in method: enable **Google**.
2. Authentication > Settings > Authorised domains: add your deployed web domain (localhost is there by default).
3. Project settings > Android app `app.pothubself.vercel`: add the SHA-1 of EVERY keystore you build with (debug, release, and Play App Signing). The bundled google-services.json lists only one SHA-1; a missing one gives "developer error".
4. Re-download google-services.json after changing fingerprints and replace the one in this folder.

Android: `npm install && npx cap add android && npm run android:sync` (the sync script copies google-services.json into android/app).
Server: `EXTRA_ORIGINS` for extra web origins; `https://localhost` (the APK origin) is already allowed.

**Live workflow terminal** - every image/video run streams steps as they happen: parse commands, detect models, route, init, generate/submit, poll, download, save. It is a real pipeline rendered as terminal lines (no shell). Before each run the app asks your connected providers which models exist now (6 s cap, cached 15 min), hides retired models, adds newer Gemini image / Veo and OpenAI gpt-image models it finds, and falls back to the next model or provider if one fails (never after part of a batch was already paid for, never on safety blocks or cancel).
Prompt commands: `/fast /quality /9:16 /n 3 /model <id> /image /video /enhance /plain /models`. `/models` lists what is available and generates nothing. Optional prompt sharpening with the cheapest current Gemini text model (Settings, off by default).

Auth-patch verification: the ZIP structure and JSON configuration files were validated. Dependency installation, TypeScript/Vitest execution, and a live Google OAuth sign-in could not be run in this environment. Test the deployed PWA after completing the Firebase and Google OAuth console steps below.

## Run (repository root)
    npm install
    npm run dev          # browser
    npm run build        # typecheck + production build
    npm test             # ZIP round-trip tests (fake-indexeddb)

## Android (Capacitor)
    npm run build
    npx cap add android          # first time only
    npm run android:sync
    npx cap open android

## What exists
- Dark design system, custom Select / Menu / Dialog (keyboard + ARIA), collapsible "More" menu, mobile drawer
- IndexedDB projects + media (atomic writes), rename / duplicate / delete-with-confirm
- Project export / import as ZIP (new ids on import, missing-file warnings)
- Storage page: quota estimate, persistence request, data-loss warning, low-storage banner
- Platform adapter: web (save picker or download) and Android (Filesystem + share sheet, back button, status bar)
- PWA manifest + app-shell service worker

## Added in build 2
- Animated welcome screen (shown once) with drifting faded artwork
- BYOK vault: fingerprint/device-lock gate (Android biometric plugin, WebAuthn in browsers), Keystore or Web Crypto storage, test / replace / remove, never re-displays keys
- Model registry (only models with a working adapter), rule-based router (intent, aspect ratio, speed vs quality), OpenAI and Gemini image adapters
- Working Image Studio: generate, save locally at once, download, delete, cancel; daily allowance counter (client-side, UTC)

## Added in build 3
- Legal: 10 written documents (versioned, dated), reachable from the More menu and the billing page
- Video Studio: Google Veo via your Gemini key; async jobs survive refresh, polling, 15-minute timeout, immediate local download with retries
- Creative Editor: multi-layer timeline (image/video/audio/text), drag/trim/split/duplicate/undo/redo, transforms, colour sliders, fades, WebM and PNG/JPEG export
- Billing: see below

## Billing (prepaid, no automatic renewal) - Flutterwave v4 card flow with PIN / OTP
Premium is bought for one month or one year and simply ends; nothing renews and no card is stored. Renewing = paying again (time is added on top).

Flow: Billing page card form -> `POST /api/pay/start` (server validates, fixes the NGN price from a live rate, records a pending payment, AES-256-GCM-encrypts the card fields and calls `POST /orchestration/direct-charges`) -> Flutterwave answers `next_action`: `requires_pin` or `requires_otp` (the app shows a PIN/OTP box and calls `/api/pay/authorize`, which does `PUT /charges/{id}`), or `redirect_url` (3-D Secure page) -> `/api/pay/status` re-fetches the charge from Flutterwave and only then grants premium. The webhook (`flutterwave-signature`, HMAC-SHA256 of the raw body) re-fetches the same way, so a payment completed after the app closed is still recorded; the license is claimed by the device that started the payment.

Storage: Firestore holds billing and security metadata (subscriptions, payments, account links, server roles, usage counters, rate limits, audit events and pending payments). Media and projects stay on the device. `firestore.rules` denies all client access; only the server (Admin SDK) reads or writes.

PCI: the card number, expiry, CVV and PIN pass through YOUR server in memory to be encrypted (Flutterwave's v4 direct card charge needs the encryption key, which must not be in the app). They are never stored or logged (see the comments in `server/src/index.ts` and `flutterwave.ts`), but this puts your server in scope for card-data handling. Run it only over HTTPS on infrastructure you control, never log request bodies, and ask Flutterwave/your acquirer about PCI requirements for direct card charges before launch. If that is too much, the alternative is Flutterwave's hosted checkout (card data never touches you).

Go-live checklist
1. Flutterwave dashboard (live mode): client id/secret, encryption key, webhook URL `https://<server>/webhooks/flutterwave` + secret hash. Put them in `server/.env` (see `.env.example`); add a Firebase service account; deploy `firestore.rules`.
2. Serve the server over HTTPS; set `APP_ORIGIN` to the web app URL and `VITE_API_URL` in the app build. `FLW_ENV=production`.
3. Make ONE real payment at the real price with your own card and go through the PIN/OTP steps; confirm premium turns on and the webhook is received. Then ask Flutterwave to refund it. Confirmed from Flutterwave's v4 guides: token call, direct-charges request shape and headers, encryption scheme, `next_action` types, `PUT /charges/{id}` PIN body, `GET /charges/{id}`, webhook signature. NOT confirmed: the OTP body (`otp:{code}`, sent unencrypted), the production API host (override with `FLW_BASE_URL`), whether your account is enabled for direct card charges, and AVS/address challenges (shown as "unsupported").
4. Cards that need extra fields (address) are not supported and show a clear message.

Known limits: Android opens 3-D Secure in the system browser and users return and press "Check payment"; no email receipts from us (Flutterwave may send its own). Account-linked license recovery requires the same verified Google email used for purchase.

## Added in build 5
- Settings page with preferred image/video model and default priority (used by Auto routing), provider "Test all", premium-ending reminder, pull-to-refresh (not in the editor), pinch / Ctrl+scroll timeline zoom on empty timeline areas.

## Editor limits
Export records in real time to WebM (no MP4/FFmpeg yet). Transitions beyond fades and caption import are not done. Pinch zoom does not work when a finger starts on a clip. Not tested on large media or on phones.

## Not built yet
Checkout and renewals, image editing/inpainting/upscaling, image-to-video, other providers (fal.ai, Replicate, Runway, Kling), FFmpeg/MP4 export, native Android processing.

## Verify before relying on it
- Model IDs, request shapes and the two Capacitor plugin versions were written from memory and NOT checked against current docs. Check them first.
- Browser calls straight to provider APIs depend on their CORS support.
- The local daily usage display is a cache and can be edited; generation attempts are checked and counted by the authenticated server API when `VITE_API_URL` is configured.

## Known limits
- Not yet installed, built or run in the authoring environment (no network): run `npm install && npm run build && npm test` first.
- ZIP import/export reads whole files into memory; fine for small projects, not for multi-GB video. Streaming comes with the media work.
- Android save writes to cache then opens the share sheet (user picks "Save to"), via a base64 copy in memory.
- PWA icon is SVG only; add 192/512 PNG (and maskable) icons before store/installability checks.
- Service worker caches the app shell only, never media or API calls.


## PWA and appearance (build 6)
- Installable web app metadata with 192/512 PNG icons, maskable icon assets, Apple touch icon, and registered app-shell service worker.
- App appearance page (`More → App appearance`) lets users select six pot silhouettes and eight accent colours. Selection is persisted locally and updates the tab icon, focus accent and install-manifest metadata.
- PWA launcher icon refresh is browser-dependent, especially after installation. Native Capacitor Android launcher icons are build-time resources and require a rebuilt APK; the in-app appearance setting does not change an installed APK icon.


## Creative Editor (CapCut-style)
Same layout as before (media list | preview | properties, timeline underneath; on phones the preview and controls come first, then the timeline, then properties and media). Added: snapping to cuts, the playhead and the frame centre; clip speed 0.25x-4x; tap and drag a layer on the preview; drag clips between layers; trim-to-playhead, ripple delete, previous/next cut, frame stepping, Fit zoom; video/image thumbnails and audio waveforms on clips; Fill frame and Reset position; save indicator. Shortcuts: Space, S, D, T, [ ], arrows (Shift = 1 s), Home/End, +/-, Delete (Shift+Delete = ripple), Ctrl+Z / Ctrl+Shift+Z.

## Build 7: files in any format, no-AI local jobs, CapCut-style editor
**Files in any format (text feature)** - ask for the format in plain words and Pothub delivers a real file: PDF, Word (.docx), Excel (.xlsx, real numbers and formulas, several sheets with `--- sheet: Name ---`), PowerPoint (.pptx, one slide per heading), CSV, JSON, HTML, Markdown, text, any text format by extension (`.py`, `.sql`, `.yaml`, `.svg`, `.ics` ...), or **a ZIP holding a whole project or a mix of files** ("build a React todo app and give me the whole project as a zip"). For a zip the model writes every file between `=== FILE: path ===` and `=== END FILE ===` markers (see `src/agent/protocol.ts`); `.pdf/.docx/.pptx/.xlsx` entries are converted to the real format inside the zip. A format only counts as the output when the wording asks for it ("summarise this PDF" stays a chat answer).

**No model, no key when none is needed** (`src/agent/local.ts`) - zip attached files, convert an attached file (text, code, CSV, JSON, Word) or the last answer ("make that a PDF") to PDF / Word / Excel / PowerPoint / CSV / JSON / HTML / Markdown / text, merge PDFs, turn photos into a PDF. These run on the device without checking providers or asking for a key. Anything that needs reading, writing or judging still goes to a model. Writing prompts also tell the model never to ask the person for an API key, model or provider the task does not need.

**Creative Editor** - CapCut layout: top bar (close, resolution, Export), full preview, play row (full screen, previous/next cut, play, snap, undo, redo), a timeline that scrolls under a fixed playhead with Mute clip / Cover on the left and Add audio / Add text rows, and an icon toolbar (Edit, Audio, Text, Effects, Overlay, Captions, Ratio). Selecting a clip swaps the toolbar for that clip's tools (Split, Trim, Speed, Volume, Effects, Adjust, Position, Flip, Rotate, Fill, Fade, Duplicate, Delete). Effects are 10 looks that also appear in exports; captions can be imported from .srt/.vtt; Cover saves the current frame as the project thumbnail.

Chat: message buttons are icons; suggested prompts disappear as soon as the box is focused or has text.

Verification: the new file builders were checked offline (openpyxl, python-pptx, LibreOffice render, zip listing) and all new logic type-checks. Run `npm install && npm run build && npm test` on your machine for the full check.


## Server-enforced security (security hardening)

Generation requests now reserve image/video allowance through `POST /api/usage/reserve` before contacting a user's selected provider. The server verifies the Firebase ID token (including revocation), reads the subscription from Firestore, and atomically increments a per-user UTC-day counter. Free limits (30 images / 10 videos per UTC day) are defined only in the server package; localStorage counters are display caches and are not authorization sources. A reservation counts an attempt, including provider failures, to prevent clients from releasing or replaying allowance.

`GET /api/account/me` returns a server-derived profile, role, subscription entitlement and usage. Admin role membership is configured only through the server-only `ADMIN_UIDS` environment variable (comma-separated Firebase UIDs); clients cannot assign roles. Billing checkout and its PIN/OTP/status continuations require a verified Firebase account, match the checkout email to that account, and bind pending transactions to the Firebase UID. Existing account linking now verifies that the signed-in verified email matches the subscription email and refuses replacing an existing account link.

Firestore server-only collections include `subscriptions`, `payments`, `accounts`, `accountRoles`, `pendingPayments`, `usageCounters`, `rateLimits`, `securityAudit` and `webhookEvents`. Account roles are initialized and resolved by the server; `ADMIN_UIDS` is the server-side bootstrap/override list, and no client role field is accepted. The supplied Firestore rules deny all client reads/writes; only Firebase Admin on the server accesses these collections. Rate limits use Firestore transactions so they apply across server instances. Audit entries store a hashed UID, action and non-sensitive metadata; request bodies, card details, provider secrets and raw IP addresses are not logged. Configure Firestore TTL on `rateLimits.expiresAt`, `usageCounters.expiresAt` and `securityAudit.expiresAt` to clean up expired limiter records, old daily counters and audit records after their retention periods. Run `cd server && npm install && npm test` to execute the server security-policy tests.

### Required deployment configuration

- Deploy the `server/` service with Firebase Admin credentials and Firestore access. Do not put service-account JSON, Flutterwave secrets, `LICENSE_SECRET`, or private provider keys in any `VITE_*` variable.
- Set the frontend build variable `VITE_API_URL` to the HTTPS base URL of that server. The build now rejects secret-looking environment-variable names with the public `VITE_` prefix.
- Set `ADMIN_UIDS` only on the server if an administrator role is required. Leave it empty otherwise.
- Deploy `server/firestore.rules` to the Firebase project and retain deny-by-default rules.
- Use HTTPS, configure `APP_ORIGIN` and `EXTRA_ORIGINS` narrowly, and enable Firestore TTL for rate-limit cleanup.
- BYOK API keys deliberately entered by a user remain in the app's encrypted local vault and are sent directly to the provider chosen by that user; they are not server environment credentials. Server-owned provider keys, if added later, must be used only by server-side provider adapters and must never be prefixed `VITE_`.

**Important boundary:** the current BYOK image/video provider requests still run from the user's device. The new server quota endpoint blocks the normal app workflow, but a technically capable user can modify a distributed client and call their own provider directly, outside Pothub. Strict enforcement against modified clients requires routing generation through server-side provider adapters and never exposing those server-owned keys.

## Large-file analysis and source verification (new)
- Extracted text and Word content above the provider-sized threshold is split into ordered 28,000-character segments with 900-character overlap. Each segment is analyzed separately, then the combined segment findings are passed to the final response writer. This avoids silently dropping the tail of large text documents and keeps segment boundaries from losing nearby context.
- Before a file-based response is delivered, a separate verification pass checks the draft against the source files / extracted segment findings and corrects unsupported or contradicted details where the model can verify them.
- The chunk pipeline is sequential and uses the user's selected provider/model and existing BYOK key. More chunks mean more provider requests, latency and possible provider charges. It is not a claim that every provider accepts arbitrarily large native video/audio files; native media limits still apply.
- **Background completion limitation:** this PWA currently runs BYOK text/media requests on the device. A hidden tab may continue while the operating system allows it, but mobile browsers can suspend or kill it, and a service worker cannot safely keep arbitrary provider generation running after the app is closed. Guaranteed completion after closing the app requires a server-owned durable job queue + object storage + authenticated job status/result delivery; Android needs a native WorkManager/foreground-worker integration for device-local jobs. That infrastructure is not present in this ZIP, so the app must not promise uninterrupted completion while closed.


## Backups

Use **Storage → Download full backup** to export chat history, editor projects, and saved/generated media into a ZIP. **Restore backup** merges by record ID and timestamp; it never clears unrelated existing data and will not overwrite a newer local record with an older backup copy. Store the downloaded ZIP somewhere outside the app. Google Drive syncing is not part of this version.


### Large-file completeness (v0.5.3)

Pothub no longer applies an application-level character, aggregate attachment-size, attachment-count, archive-entry-count, per-archive-entry-size, or aggregate archive-text cutoff during extraction. Readable text is passed through overlapping provider-sized chunks, and large chunk findings are consolidated hierarchically before the final answer. Text generation continues across provider length-limit responses without a fixed round-count ceiling. The browser, available device memory/storage, network, provider upload limits, model context window, provider quotas, and unsupported/encrypted formats remain real external constraints; failures are surfaced rather than silently dropping a tail. Very large archives may require substantial device memory while ZIP/TAR contents are expanded.


### Plan allowances preserved (v0.5.4)
The large-file extraction/chunking change does **not** remove plan allowances. Free accounts retain 10 attachments per 5-hour window and 10 completed file-analysis requests per 5-hour window. Both windows begin with the first use and reset 5 hours later. A single analysis request can read multiple source files and counts as one analysis; generated files count when they are supplied as source inputs to a file-analysis request. Premium accounts have unlimited attachments and file analyses. The picker itself remains dynamically plan-aware rather than hard-coding a 10-file cap, so Premium is not accidentally capped.


## v0.5.5 editor and research improvements

- Pinch with two fingers on the preview to resize the selected visual or text layer; the Position and Resize tools expose a precise size slider.
- Long-press a timeline clip on touch screens to begin dragging it; move it across time or to another compatible track. Mouse drag and trim handles remain available.
- Timeline zoom controls and timeline-height controls make the track area easier to inspect on mobile. Pinch on the timeline continues to zoom its time scale.
- Track controls (Mute, Cover, Add text, and Add audio) are now inside the horizontally scrolling timeline so they travel with their corresponding tracks.
- Video clips include a Freeze action that captures the current preview frame and inserts a two-second still image clip at the playhead.
- Requests that clearly depend on current information (for example “today”, “latest”, prices, current news, weather, schedules, and rankings) automatically invoke web search within the user's available search allowance. Web-researched answers are instructed to be detailed, structured, date-aware, and source-linked.

Build and device-level gesture testing should be run on the target Android device before production release.
