# Pothub (formerly AI Creative Studio)

## Build 6: Google sign-in and live workflow
**Sign-in (Firebase project `pothub-ca2a1`)** - Browser: Google account popup (`signInWithPopup`, no redirect). Android APK: native Google account sheet via `@capacitor-firebase/authentication` with `skipNativeAuth`, then the idToken signs the Firebase JS SDK in, so both share one user. Optional: signed-in users get their premium licence saved to their account and restored on a new device (`/api/account/link`, `/api/account/license`, verified with the Firebase Admin SDK).

One-time Firebase console setup:
1. Authentication > Sign-in method: enable **Google**.
2. Authentication > Settings > Authorised domains: add your deployed web domain (localhost is there by default).
3. Project settings > Android app `app.pothubself.vercel`: add the SHA-1 of EVERY keystore you build with (debug, release, and Play App Signing). The bundled google-services.json lists only one SHA-1; a missing one gives "developer error".
4. Re-download google-services.json after changing fingerprints and replace the one in this folder.

Android: `npm install && npx cap add android && npm run android:sync` (the sync script copies google-services.json into android/app).
Server: `EXTRA_ORIGINS` for extra web origins; `https://localhost` (the APK origin) is already allowed.

**Live workflow terminal** - every image/video run streams steps as they happen: parse commands, detect models, route, init, generate/submit, poll, download, save. It is a real pipeline rendered as terminal lines (no shell). Before each run the app asks your connected providers which models exist now (6 s cap, cached 15 min), hides retired models, adds newer Gemini image / Veo and OpenAI gpt-image models it finds, and falls back to the next model or provider if one fails (never after part of a batch was already paid for, never on safety blocks or cancel).
Prompt commands: `/fast /quality /9:16 /n 3 /model <id> /image /video /enhance /plain /models`. `/models` lists what is available and generates nothing. Optional prompt sharpening with the cheapest current Gemini text model (Settings, off by default).

Not verified here (no network in the authoring sandbox): `npm install`, `tsc`, `vitest`, a real Google sign-in, real provider calls. Syntax of every file was checked and the command parser/router were run. Model ids were checked against Google docs on 16 Nov 2026; Veo 3.1 aspect/duration options beyond 16:9 and 8 s are assumptions.

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

Storage: Firestore holds billing records only (subscriptions, payments, webhook ids, pending payments). Media and projects never leave the device. `firestore.rules` denies all client access; only the server (Admin SDK) reads or writes.

PCI: the card number, expiry, CVV and PIN pass through YOUR server in memory to be encrypted (Flutterwave's v4 direct card charge needs the encryption key, which must not be in the app). They are never stored or logged (see the comments in `server/src/index.ts` and `flutterwave.ts`), but this puts your server in scope for card-data handling. Run it only over HTTPS on infrastructure you control, never log request bodies, and ask Flutterwave/your acquirer about PCI requirements for direct card charges before launch. If that is too much, the alternative is Flutterwave's hosted checkout (card data never touches you).

Go-live checklist
1. Flutterwave dashboard (live mode): client id/secret, encryption key, webhook URL `https://<server>/webhooks/flutterwave` + secret hash. Put them in `server/.env` (see `.env.example`); add a Firebase service account; deploy `firestore.rules`.
2. Serve the server over HTTPS; set `APP_ORIGIN` to the web app URL and `VITE_API_URL` in the app build. `FLW_ENV=production`.
3. Make ONE real payment at the real price with your own card and go through the PIN/OTP steps; confirm premium turns on and the webhook is received. Then ask Flutterwave to refund it. Confirmed from Flutterwave's v4 guides: token call, direct-charges request shape and headers, encryption scheme, `next_action` types, `PUT /charges/{id}` PIN body, `GET /charges/{id}`, webhook signature. NOT confirmed: the OTP body (`otp:{code}`, sent unencrypted), the production API host (override with `FLW_BASE_URL`), whether your account is enabled for direct card charges, and AVS/address challenges (shown as "unsupported").
4. Cards that need extra fields (address) are not supported and show a clear message.

Known limits: no accounts, so a lost license cannot be recovered by us; Android opens 3-D Secure in the system browser and users return and press "Check payment"; no email receipts from us (Flutterwave may send its own).

## Added in build 5
- Settings page with preferred image/video model and default priority (used by Auto routing), provider "Test all", premium-ending reminder, pull-to-refresh (not in the editor), pinch / Ctrl+scroll timeline zoom on empty timeline areas.

## Editor limits
Export records in real time to WebM (no MP4/FFmpeg yet). Transitions beyond fades and caption import are not done. Pinch zoom does not work when a finger starts on a clip. Not tested on large media or on phones.

## Not built yet
Checkout and renewals, image editing/inpainting/upscaling, image-to-video, other providers (fal.ai, Replicate, Runway, Kling), FFmpeg/MP4 export, native Android processing.

## Verify before relying on it
- Model IDs, request shapes and the two Capacitor plugin versions were written from memory and NOT checked against current docs. Check them first.
- Browser calls straight to provider APIs depend on their CORS support.
- The daily allowance lives in localStorage and can be edited by the user; real enforcement needs the billing server.

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
