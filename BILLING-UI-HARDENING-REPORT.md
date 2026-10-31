# PotHub API UI, Agent Billing & Currency Hardening

Date: 31 October 2026

## Implemented

### API & Agents UI
- Replaced the API-agent save `alert()` with a PotHub success toast that is bounded, dismissible, and auto-dismisses.
- Replaced browser `prompt()` passcode entry with a branded PotHub modal for passcode setup, confirmation, and verification.
- Added input validation, cancellation handling, Escape-to-cancel, keyboard focus containment, numeric input mode, and a secure passcode explanation.
- Removed the browser-prompt fallback from biometric logic. If the PotHub dialog callback is not wired, the operation fails safely with a clear error rather than opening a browser dialog.
- WebAuthn passkey registration now configures the fallback PIN first. If the OS/browser passkey sheet is cancelled or registration fails, the PIN-only lock remains active instead of leaving a partially enabled lock.

Note: the actual WebAuthn credential chooser and native Android biometric sheet are owned by the browser/operating system and cannot be visually restyled by a web page. PotHub now uses its own UI around PIN setup and fallback.

### Credit and agent selection policy
- Creator configured-agent chat and image operations use the existing 1-credit BYO service fee. Creator video is charged at delivery using the existing 1-credit fee.
- Developer own-agent diagnosis and repair use the existing 2-credit BYO service fee.
- Added an account-level Developer AI mode setting stored in the authenticated Firestore profile: `pothub` or `own`.
- Default is `pothub` for existing accounts. In this mode, any client-supplied agent config is ignored by the server and platform usage prices apply (10 credits for diagnosis, 20 for repair proposal).
- In `own` mode, the server only accepts task-compatible agent candidates. If none are supplied, it returns `AGENT_NOT_CONFIGURED` (409) before reserving credits; it does not silently switch to Pothub AI.
- Server-side mode selection is authoritative. Client headers cannot reduce a Pothub AI charge.
- Responses now include `billingMode` where applicable, making the applied billing path explicit.

### Naira equivalents
- Added indicative NGN equivalents to credit pack API responses and checkout UI.
- Added `POTHUB_USD_NGN_RATE` as an optional server environment variable. If unset or invalid, the display uses a bounded fallback of ₦1,347/USD.
- The USD amount remains the actual Flutterwave checkout and server verification currency. NGN is a display-only equivalent; it does not change payment settlement.

## Validation

- Server/scripts/tests/src-lib JavaScript syntax: PASS.
- All UI JSX transpile syntax checks: PASS.
- Static release audit: PASS.
- Focused tests: 11/11 PASS (agent-mode policy, currency conversion, billing policy, biometric routing).
- Full test suite: 70 passed, 16 blocked because dependencies are not installed in this workspace (`express`, `firebase-admin`, `@hapi/iron`, `typescript`).
- `npm run build`: BLOCKED before Next.js build because the PDF.js worker is absent; dependency installation is required.
- Live Firestore profile setting, live Creator request with a real provider key, Flutterwave settlement, browser WebAuthn, and physical Android biometrics were not executed here.

## Deployment

No new required secret was introduced. Optionally set `POTHUB_USD_NGN_RATE` in Vercel Production, Preview, and Development to the chosen display conversion rate. If omitted, PotHub uses the documented indicative fallback. Deploy the entire project so the new `/api/settings/agent-mode` endpoint and frontend setting ship together.
