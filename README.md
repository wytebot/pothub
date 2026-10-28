# Pothub

Pothub is a React 18 + Vite PWA and Capacitor Android workspace with an Express API, GitHub OAuth, Firebase Admin/Firestore persistence, Gemini-powered developer workflows, File Studio exports, a Creator image adapter, Vercel integration and Flutterwave v4 USD credit checkout.

## Runtime and data safety

- Firestore is accessed by the server through Firebase Admin. Client Firestore/Auth/Analytics SDKs have been removed because no complete client identity flow used them and Firestore rules deny client access.
- Credit packs and operation costs live in `server/pricing.js`. The UI fetches them from `/api/pricing`.
- `/api/health` reports required environment configuration and whether Firebase Admin initialized; a healthy response is not proof that external credentials or payment flows work.
- GitHub is the current authentication provider. Creator Google authentication is not complete.
- Image generation uses a Gemini adapter when the configured model returns actual image data. Video generation UI and endpoint have been removed because no working adapter is implemented.
- User-supplied agent keys are transient request data and should not be logged or persisted. Requests still pass through the Pothub API, so keys are visible to the server process while the request runs.
- Flutterwave is still a direct-charge integration with encrypted card fields. It is not hosted checkout and requires payment-provider and PCI review. The webhook endpoint requires `FLW_WEBHOOK_SECRET_HASH`; without it, the endpoint fails closed with HTTP 503.

## Minimum Vercel configuration

Eight required variables: `FIREBASE_SERVICE_ACCOUNT_JSON`, `SESSION_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GEMINI_API_KEY`, `FLW_CLIENT_ID`, `FLW_CLIENT_SECRET`, `FLW_ENCRYPTION_KEY`. `GEMINI_API_KEY` accepts a comma-separated list. `APP_URL` is recommended, but not required; the server derives a trusted deployment origin rather than trusting request Host headers. See [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for optional integrations and local setup.

## Local development

```sh
cp .env.example .env
npm install
npm run dev
```

Vite serves the frontend. `npm run dev:api` starts the Express API separately. For a reproducible clean install, commit a generated `package-lock.json` and use `npm ci`; this supplied archive does not include a lockfile, and the audit environment could not complete dependency installation.

## Verification commands

```sh
npm test
npm run check
npm run pricing:check
npm run build
```

The current test suite contains eight unit tests for pure safety/validation functions. It does not yet prove Firestore transaction concurrency/refund-on-failure, live webhook replay behavior, payment challenge states, browser flows, generated Office/PDF validity, Lighthouse scores or native Android behavior. Do not treat the existing source audit as a production certification.

## Deployment and rollback

1. Configure the eight required secrets in Vercel and set `APP_URL` to the canonical HTTPS domain.
2. Deploy Firestore rules and indexes.
3. Run the migration dry-run with temporary legacy Supabase credentials if existing accounts or paid orders exist. Do not migrate into a non-empty Firestore collection; reconcile manually.
4. Deploy a preview first, verify `/api/health`, GitHub OAuth, account balances, checkout sandbox, webhook verification, refunds and file downloads.
5. Promote only after those checks pass. Keep the previous Vercel deployment and the Supabase source intact until the cutover is reconciled. Roll back by promoting the prior deployment; do not delete or mutate the source database during rollback.

## Owner must verify before production

- Firebase: validate service-account permissions, indexes, rules, transaction contention and migrated balances.
- GitHub: OAuth callback, native ticket handoff, disconnect/revoke and expired sessions.
- Flutterwave: sandbox token/charge, PIN/OTP/AVS/3DS, amount/currency/reference verification, duplicate webhook and retry safety.
- AI: real Gemini model availability, image-capable model response, timeout/refund behavior and provider costs.
- Vercel: clean install/build, `/api/health`, OAuth redirects, deployed bundle secret scan and serverless timeout behavior.
- Android: generated plugin registration, public Downloads save, share sheet, hardware Back, deep links, offline behavior and keyboard-safe checkout on a real device.
- Browser: mobile/desktop layouts, route refresh/Back, keyboard, focus, reduced motion, offline updates and console errors.

See `FINDINGS_LEDGER.md` for what this audit actually verified and what remains open.


### Firebase GitHub authentication
Browser sign-in can use Firebase Authentication's GitHub provider. Configure the four public `VITE_FIREBASE_*` values and enable the GitHub provider/scopes in Firebase Console; see `ENVIRONMENT_VARIABLES.md`. The API validates the Firebase ID token and independently checks the GitHub access token before establishing the existing server session. Native APK still uses the prior OAuth browser handoff for now, keeping its existing behavior until the Firebase-to-native credential handoff is implemented and tested.

### Credit pack planning estimate
Current proposed packs are $1.99/24, $4.99/74, $9.99/158, and $19.99/324 credits. `npm run pricing:check` models a $0.003 base provider cost per credit doubled for safety, $0.05 infrastructure per order, and the higher of a 30% app-store fee or 3.5% + $0.30 web fee. These assumptions are conservative planning inputs—not live cost measurements. Check actual model token usage, image costs, retries, taxes, refunds, and processor invoices before launch.

### Optional biometric lock for API settings

The BYO-agent API environment has an opt-in **Secret mode**. It is off on first visit, so the settings panel opens normally and advises the user to enable it. Once enabled, reopening the panel requires device verification: native Android builds use the system biometric prompt, while secure browser origins use a WebAuthn platform authenticator. No new environment variables are required. See `ENVIRONMENT_VARIABLES.md` for compatibility notes and the security boundary.

For Android, install dependencies and run `npm run android:configure` (or `npx cap sync android`) before building the APK so Capacitor registers the biometric plugin. Browser biometric setup requires HTTPS and a device/browser that supports platform WebAuthn.
