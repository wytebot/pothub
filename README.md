# Pothub

Pothub is a mobile-first developer workspace for diagnosing GitHub repository and deployment problems, preparing reviewable repair branches, and generating text-based files. It is a PWA and can be packaged with Capacitor for Android.

## Main features
- GitHub OAuth and repository browsing.
- Vercel OAuth with encrypted per-user tokens stored server-side, plus a user-supplied local token fallback.
- Evidence-based AI diagnosis and repair proposals, with a new branch for explicit commits.
- Three configurable Gemini keys with fallback, plus an optional OpenAI-compatible provider fallback.
- Credit packs paid once through Flutterwave v4 (USD checkout).
- Local project/task/history storage in IndexedDB, optional Drive backup, and a File Studio for text/code formats plus simple PDF, DOCX and XLSX exports.
- PWA app shell caching and browser/Capacitor file downloads.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

The Vite frontend runs on port 5173. In another terminal, run the API:

```bash
npm run dev:api
```

The API listens on port 8787 and Vite proxies `/api` requests to it.

## Required server configuration

Set the following on the server, never in frontend `VITE_` variables:

- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET` (at least 32 random characters)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- At least one of `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`

Set model overrides with `GEMINI_MODEL`, `GEMINI_MODEL_2`, and `GEMINI_MODEL_3`. Optional compatible fallback provider: `AI_FALLBACK_BASE_URL`, `AI_FALLBACK_API_KEY`, `AI_FALLBACK_MODEL`. Request budgets: `AI_MAX_PROMPT_CHARS` (default 60000) and `AI_MAX_OUTPUT_TOKENS` (default 3072; capped by server code).

For Flutterwave v4 checkout, configure `FLW_CLIENT_ID`, `FLW_CLIENT_SECRET`, `FLW_ENCRYPTION_KEY`, `FLW_MODE`, and Supabase. Checkout is USD-only. `VITE_NGN_PER_USD` is an optional display-only estimate, not a naira payment setting.

For remote notifications, configure VAPID variables for web push and/or `FIREBASE_SERVICE_ACCOUNT_JSON` for Firebase Cloud Messaging. Configure matching GitHub/Vercel webhook secrets and webhook subscriptions. Review `ENVIRONMENT_VARIABLES.md` for the complete list.

## Database

Run `supabase/schema.sql` in the target Supabase SQL editor. It creates the profile, order, credit ledger, task and notification tables plus atomic RPC functions for profile initialization, credit spending and credit grants. Re-run the schema only after reviewing any existing production schema and migrations.

## Build and Android

```bash
npm run check
npm run build
npx cap add android   # only for the first Android project setup
npm run android:configure
npm run cap:sync
npm run android
```

The Capacitor package ID remains `app.kithub.ai` so an updated APK can replace the earlier build. The visible app name is Pothub. The native OAuth deep link is `ai.pothub.app://auth`. For a standalone APK, configure the deployed HTTPS API origin in Settings → App connection, or set `VITE_API_BASE_URL` at build time.

## Pricing and safety

One-time packs: $1.99/20 credits, $4.99/60, $9.99/130, and $19.99/260. Diagnosis uses 10 credits, repair proposal uses 20, and File Studio uses 15. These are initial price/credit settings, not proof of a 60% net margin. Validate measured all-in costs before launch. Credit accounting fails closed if Supabase is unavailable; AI operations reserve credits before calling a model and attempt refunds on failed calls.

AI output is not proof that code builds or is safe. Review patches, run tests, and review a branch before merging. Arbitrary repository scripts are not executed by Pothub's API. File Studio generates common text/code formats plus simple PDF, DOCX and XLSX files. Image, audio, video, PowerPoint and arbitrary binary formats are not supported yet; review generated files before use.

## Known release limitations

- Complete production frontend build and APK test are not yet verified in this environment because dependency installation timed out.
- Vercel OAuth is implemented at source level but has not been live-tested; configure exact callback and the required Vercel API permissions. A personal-token fallback remains.
- Closed-app notifications require correctly configured web push/FCM and real webhook delivery.
- Device ID hashing deters casual abuse but cannot guarantee one free grant per physical device.
- Play Store payment-policy requirements must be reviewed before publishing an APK to Google Play.

See `IMPLEMENTATION_STATUS.md` for the current verification status and remaining release checklist.
