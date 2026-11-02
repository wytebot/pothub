# Popup Domain Redaction and Native Dialog Removal

Date: 2026-10-31

## User-facing changes

- Added `cleanDisplayMessage()` and applied it to error toasts, success notices, passcode dialog copy/errors, action confirmations, and payment status text.
- The sanitizer removes full HTTP(S) URLs and common deployment hostnames (including `*.vercel.app`) from user-facing dialog text while preserving useful status/error details.
- Removed all browser-native `window.alert`, `window.confirm`, and `window.prompt` calls from `src/` UI code. Agent removal, fix verification, repair-branch revert, and commit-message entry now use PotHub's own modal UI.
- Replaced API/network diagnostics that previously embedded the deployment origin with generic service wording. API route and HTTP status remain available for troubleshooting.
- Added bounded, responsive styles for the custom action dialog.

## Validation performed

- `node --check` across server, scripts and test JavaScript/MJS: PASS.
- TypeScript parser check across all `src/ui/*.jsx`: PASS.
- `tests/display-message.test.mjs`: 3/3 PASS.
- `scripts/release-audit.mjs`: PASS (static audit only).
- Source scan for native alert/confirm/prompt: no matches.
- Source scan for `pothub-self.vercel.app` under `src/`: no matches.

## Limitations

- This does not hide the website origin from the browser address bar, browser-managed OAuth/security UI, or the operating system's WebAuthn/passkey chooser. Browsers intentionally display the relying-party origin in security-sensitive prompts; the application cannot safely suppress or rename that browser-controlled identity.
- Full dependency-backed production build, deployed browser test, OAuth round-trip and physical Android test were not run in this environment.
