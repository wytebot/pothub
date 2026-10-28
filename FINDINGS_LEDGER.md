# Pothub findings ledger — 2026-10-28

This ledger records evidence from the supplied archive and this local audit. “Fixed” means the source change and the stated local check were completed; it does not imply live deployment validation.

| ID | File / location | Severity | Symptom / root cause | Fix | Verification / status |
|---|---|---:|---|---|---|
| PH-001 | `server/lib.js:initFirebaseAdmin` | Critical | Initialization called `admin.app()` although `admin` was never imported; Firebase Admin startup failed whenever the app was first initialized. | Return `getApps()[0]` after initialization. | `node --check server/lib.js` passes; live Firebase initialization remains unverified. Fixed in source. |
| PH-002 | `src/main.jsx`, `src/lib/firebase.js`, `package.json` | Medium | Browser Firebase Auth/Firestore/Analytics SDK was imported but not used for a complete auth flow; hardcoded public Firebase config was dead weight while direct Firestore access is denied. | Removed browser initialization/module and `firebase` client dependency; retained server-only `firebase-admin`. | Source scan shows no `src/lib/firebase.js` import; release audit checks this. Build unverified due dependency install timeout. Fixed in source. |
| PH-003 | `server/lib.js:origin` | High | OAuth/payment redirects could be derived from untrusted `Host` / forwarded-host headers, enabling redirect-origin manipulation. | Canonical `APP_URL`, trusted Vercel deployment hostname, then fixed product-origin fallback; validates configured URL and HTTPS in production. | Node syntax check passes. OAuth redirect behavior requires deployment test. Fixed in source. |
| PH-004 | `server/app.js`, `server/pricing.js`, `src/ui/App.jsx` | High | UI hardcoded credit-pack prices and operation prices, risking drift from server billing. | Added `/api/pricing`; UI fetches pack and operation pricing; pack/operation values and BYO service fees come from `server/pricing.js`. | Release source audit validates module values and API/UI wiring. JSX/Vite build unverified. Fixed in source pending build. |
| PH-005 | `server/app.js:modelJson` | Medium | Server Gemini failover depended on separate `GEMINI_API_KEY_2/_3` variables rather than the requested single comma-separated list. | Parse comma-separated `GEMINI_API_KEY` and try each key in order. | Node syntax check passes. Provider failover requires mocked/live API tests. Fixed in source. |
| PH-006 | `firebase.firestore.rules`, `public/_redirects` | Low | Duplicate Firestore rules file and Netlify-only redirects cluttered a Vercel project. | Removed duplicate rules file; `firebase.json` points to `firestore.rules`; removed Netlify redirect file. | File/config inspection. Fixed in source. |
| PH-007 | `.env.example`, `ENVIRONMENT_VARIABLES.md`, `README.md` | High | Docs contradicted one another about client Firebase config, duplicate variables, and runtime requirements. | Rewrote setup docs to describe eight intended required server variables, optional integrations and known incomplete features. | Manual consistency review; live Vercel settings are not accessible here. Fixed in docs; owner must confirm actual deployment variables. |
| PH-008 | `scripts/release-audit.mjs` | Medium | Old audit relied on fragile source-string assumptions and did not inspect package/manifest JSON or shared pricing exports robustly. | Replaced with structural source checks, JSON parsing, pricing invariants, Firebase rules and client-SDK checks. | `node scripts/release-audit.mjs` must pass in final check. Static audit is not integration testing. Fixed in source. |
| PH-009 | `package-lock.json` | High | Supplied archive has no lockfile, so `npm ci` cannot be reproduced. Dependency installation timed out in this environment. | Not fixed: package registry/install could not complete, and a fabricated lockfile would be unsafe. | `npm install --no-audit --no-fund` timed out. Owner must generate/commit a real lockfile in a networked environment. Deferred. |
| PH-010 | `tests/core.test.mjs` | High | Credit reserve/refund test is arithmetic-only and does not execute the Firestore implementation. | Not fully fixed; this requires a Firestore Emulator and testable service boundary. | Existing suite passes 5/5, but does not prove concurrency/idempotency/refunds. Deferred. |
| PH-011 | `server/app.js` and Flutterwave integration | Critical | Direct card-charge flow and payment/webhook/authorization paths have not been exercised end-to-end; client-side encrypted card fields remain in use. | No safe claim of production readiness; documented as an open owner verification and PCI review item. | No Flutterwave credentials/network integration available. Deferred. |
| PH-012 | Creator authentication | High | API `requireUser` requires a GitHub session; Google/Firebase ID-token flow is not implemented end-to-end. | Removed unused client Firebase SDK instead of implying Google auth works. | Source inspection. Creator Google sign-in remains unsupported. Deferred. |
| PH-013 | Creator video | Medium | UI/server may expose a video route without a working provider adapter. | README/env docs explicitly state video generation is not implemented; route should not be presented as a working capability until the UI is checked and removed/hidden. | Full UI/build check unavailable; deferred UI verification. |
| PH-014 | Frontend and native UX | High | App remains a dense, monolithic `App.jsx`; no complete route/accessibility/modal/viewport regression suite exists in this environment. | No broad rewrite attempted without a build/test toolchain, to avoid destructive unverified refactoring. | Vite/Playwright/Lighthouse/native device tests unavailable. Deferred. |
| PH-015 | `vercel.json`, production deployment | High | No production Vercel access or clean build proof; rewrite/security headers, function timeouts and deployed bundle scan remain unverified. | No claim of deployed or production-ready status. | No deployment credentials; `npm ci` and Vite build not completed. Owner must verify. Deferred. |
| PH-016 | Firestore migration script | Critical | A successful local dry-run/import and reconciliation of existing user balances, orders, ledger and encrypted tokens cannot be established without both real data sources. | Retained the fail-closed migration flow and documented not to overwrite non-empty targets. | Not run against live projects. Deferred until owner supplies credentials and reconciles report. |

## Verified commands in this audit

- `node --check server/lib.js` — passed.
- `node --check server/app.js` — passed.
- `npm test` — 5 passed, 0 failed (existing lightweight tests only).
- `npm install --no-audit --no-fund` — timed out; no complete dependency install.
- `npm run build` — failed with `vite: not found`, confirming the frontend build could not run without dependencies.
- `npm ci`, `npm run build`, Playwright, Lighthouse, Firestore Emulator, live OAuth/payment, and Android device tests — not completed.

## Release decision

**Not production-certified.** The source hardening above is useful, but the definition of done is not met until a real lockfile is committed, clean install/build pass, emulator and integration tests pass, and owner verification items are checked.


## Follow-up implementation pass — 2026-10-28 evening

| ID | File / location | Severity | Symptom / root cause | Fix | Verification / status |
|---|---|---:|---|---|---|
| PH-017 | `server/lib.js:grant_credits`, `server/billing-safety.js` | Critical | Credit grants previously depended on a Firestore query over positive ledger deltas and were vulnerable to repeated grant attempts if order status updates raced. | Added deterministic SHA-256 grant marker per account + payment reference; marker and ledger entry are created in the same Firestore transaction. | Pure deterministic-ID tests pass; actual Firestore transaction contention still requires Emulator verification. Source fixed, integration unverified. |
| PH-018 | `server/app.js:/api/webhooks/flutterwave`, `server/billing-safety.js` | Critical | Webhook route previously processed events without checking the Flutterwave `verif-hash` header. | Endpoint now fails closed with 503 when `FLW_WEBHOOK_SECRET_HASH` is absent, rejects mismatched signatures using constant-time comparison, re-fetches the charge from Flutterwave, and checks persisted order reference, provider charge ID, amount, currency and successful status before granting. | Signature and payment-predicate tests pass. Real Flutterwave webhook delivery remains unverified. |
| PH-019 | `server/lib.js:flwToken/flwFetch` | High | Token was fetched for every operation and outbound calls had no explicit timeout. | Added warm-instance token cache with expiry margin, concurrent token-request coalescing, and 12s token / 18s API abort timeouts with user-safe timeout messages. | Syntax checks pass; provider calls not run without credentials/network access. |
| PH-020 | `server/ai-safety.js`, `server/app.js:modelJson/parseJson` | Medium | Prompt bounding and JSON response parsing were embedded in route code and were difficult to test independently. | Extracted the actual production prompt-bound and model JSON parser functions, including rejection of non-object JSON. | Unit tests exercise the exact production functions and pass. |
| PH-021 | `src/ui/App.jsx`, `server/app.js` | Medium | Creator workspace showed a video mode despite having no video adapter. | Removed video generation control, associated mode state, and unsupported video endpoint. Creator workspace now exposes image generation only. | Source scan confirms no creator video mode or route remains; JSX build remains unverified because dependencies could not be installed. |
| PH-022 | `src/ui/styles.css` | Medium | Primary button text and popular pack ribbon had poor contrast; purple leftovers conflicted with monochrome theme; small-screen input zoom/reduced-motion behavior was not hardened. | Fixed primary button/ribbon contrast, replaced identified purple values, added visible focus, reduced-motion overrides, `dvh` fallback and mobile input/touch-target overrides. | Source checks pass; automated WCAG contrast and viewport screenshots remain unverified. |

### Follow-up test results

- `node --check server/lib.js` — passed.
- `node --check server/app.js` — passed.
- `node --check server/billing-safety.js` — passed.
- `node --check server/ai-safety.js` — passed.
- `node scripts/release-audit.mjs` — passed.
- `npm test` — 8 passed, 0 failed. These include actual payment predicate, webhook secret, deterministic grant ID, prompt bounding and model JSON parser tests. They do not simulate Firestore transactions.
- `node scripts/pricing-check.mjs` — passed; public pack prices and operation costs unchanged.
- `npm install --no-audit --no-fund --fetch-timeout=20000 --fetch-retries=0` — timed out again; no clean Vite build or JSX compile could be run.

## Still not completed / not proven

- Firestore Emulator integration for concurrent spend, duplicate grants, refund failure paths, and migration reconciliation.
- Flutterwave sandbox/live auth challenges, webhook delivery, hosted-checkout feasibility and PCI review.
- A real lockfile (`package-lock.json`) and `npm ci`/Vite production build.
- Full React/Playwright E2E, Lighthouse and accessibility/contrast automation.
- Creator Google auth, native Android integration/device checks, full route/back-button/keyboard testing, and production Vercel state.
- Optional Vercel OAuth, push subscriptions, VAPID persistence, rate limiting across serverless instances and all file export formats are not fully verified.

The release is improved but remains **not production-certified**.


## PH-023 — Firebase-backed GitHub browser sign-in
- Implemented Firebase GitHub popup sign-in for the browser, server-side Firebase ID-token verification, independent GitHub token validation, and issuance of the existing secure session. Preserves numeric GitHub ID for account/credit continuity.
- Requires Firebase web config and GitHub provider/scopes to be configured in Firebase Console. Not end-to-end tested against a live Firebase project. Native APK remains on the existing OAuth handoff pending a dedicated Firebase native credential flow.

## PH-024 — Credit pack estimate and revised counts
- Revised pack counts to 24/74/158/324 at unchanged prices $1.99/$4.99/$9.99/$19.99. Calculation targets ~60% gross margin under explicitly stated assumptions: $0.003 base AI/provider cost per credit × 2 safety factor, $0.05 infrastructure per order, and worst of assumed 30% app-store fee or 3.5% + $0.30 web fee.
- This is a sensitivity model, not a verified unit-economics result. Measure real per-operation model usage and actual fee schedule before treating margins as real.
