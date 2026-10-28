# Changelog

## 2026-10-28 — Repository audit hardening

- Fixed Firebase Admin initialization to return the initialized app instead of referencing an undefined `admin` symbol.
- Removed unused Firebase browser SDK initialization and its hardcoded public configuration; server-side Admin SDK remains.
- Added a public `/api/pricing` endpoint and switched credit-pack/operation-cost display to server pricing data.
- Added comma-separated Gemini key routing through `GEMINI_API_KEY`.
- Made OAuth/payment origin derivation ignore untrusted request Host headers.
- Removed duplicate Firestore rules file and Netlify-only redirect file from this Vercel project.
- Rewrote environment documentation to match the intended eight-variable configuration and disclose known incomplete flows.
- Added this audit's evidence and deferred items to `FINDINGS_LEDGER.md`.

Verification limits: `npm test` passed 5/5 and Node syntax checks passed for server files. Dependency installation timed out; `npm run build` then failed because Vite was not installed. Browser E2E, Firebase Emulator, live payment/OAuth and real Android testing remain unverified.

## 2026-10-28 — Follow-up hardening
- Added deterministic transactional grant markers to make repeated payment verification/webhook grants idempotent.
- Added fail-closed Flutterwave webhook shared-secret verification and server-side amount/currency/reference/charge-ID checks.
- Cached Flutterwave tokens and bounded provider request durations.
- Extracted and tested prompt bounding and model JSON parsing.
- Removed unsupported Creator video mode and corrected identified contrast, focus, reduced-motion and mobile input issues.
- Verification: 8 unit tests, source audit, pricing check and JavaScript syntax checks pass. Build, emulator, provider and device checks remain unverified.


## Follow-up: Firebase GitHub authentication and credit repricing
- Added browser Firebase Authentication with GitHub provider/scopes. The backend verifies Firebase ID tokens, validates the GitHub provider access token with GitHub, and then issues the existing secure Pothub session while preserving the GitHub numeric account key used by Firestore. Existing OAuth remains fallback/native flow for compatibility.
- Added `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID` configuration guidance.
- Repriced packs without raising their USD prices: $1.99/24 credits, $4.99/74, $9.99/158, $19.99/324. Planning model now assumes $0.003 per credit before a 2× safety factor, plus $0.05 infrastructure/order and the higher of assumed 30% app-store fees or 3.5% + $0.30 web fees. These are estimates, not measured provider invoices.


## Optional biometric Secret mode
- Added an opt-in lock for the BYO-agent API environment; first visit remains ungated.
- Capacitor Android uses the native device biometric prompt; HTTPS browsers use a WebAuthn platform authenticator.
- Reopening the API settings panel requests verification again while Secret mode is enabled.
- Documented that this is a local privacy gate, not a replacement for server-side secret storage.

## Secret Mode hardening follow-up
- Provider keys are now held only in JavaScript memory; legacy `sessionStorage` entries are deleted at startup.
- Runtime API requests fail closed when Secret Mode is enabled and agent access is locked.
- Agent access relocks when the app/page is backgrounded or hidden and when the settings panel closes.
- Release source audit now checks that provider keys are not read from Web Storage and that runtime lock checks are present.
- Limitation: browser WebAuthn registration is still a local platform-authenticator gate, not a server-verified account credential. It cannot defend against malicious same-origin JavaScript, browser extensions, devtools, or a compromised device. Native biometric UI is not equivalent to cryptographic key storage.
