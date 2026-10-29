# Pothub reliability and safety hardening

This update is additive to the GitHub Pages + Vercel split. It retains the existing React/Vite frontend, Express API, Firebase profile/credit store, GitHub OAuth, Google/Firebase sign-in, Vercel diagnostics, Creator media tools, and Flutterwave v4 checkout.

## Included changes

- **Payment verification:** checkout verification and successful authorization now require the fetched Flutterwave charge to match the persisted order's provider charge ID, reference, amount, currency, and successful status. Client-supplied pack amounts are never trusted; pack pricing/credits still come from server-side configuration.
- **Credit grants:** payment grants remain transactional and idempotent through deterministic Firestore grant markers. If an order-status write fails after a verified grant, the server logs the mismatch without attempting a second grant; retrying verification remains safe.
- **Checkout idempotency:** validates idempotency-key format and rejects reusing the same key for a different credit pack.
- **Image outputs:** validates base64 and MIME, caps each generated image at 8 MB and combined response data at 12 MB, and warns when local IndexedDB storage cannot retain an image so the user can download it before leaving the chat.
- **Video delivery:** fully receives the provider's video artifact and checks its type and configured size limit before deducting credits and returning it. This avoids charging for a provider download that fails partway through. `POTHUB_VIDEO_MAX_BYTES` remains configurable (bounded to 1–150 MB; default 150 MB).
- **Repository commits:** validates repository identifiers, branch/path safety, duplicate paths, sensitive filenames, likely leaked credentials/private keys, per-file size and total patch size before calling GitHub write APIs. Changes still go to a new repair branch rather than directly modifying the default branch.
- **Tests:** adds regression coverage for commit path/secret/size checks while retaining existing authentication, payment, backup, diagnostics, and video route tests.

## Validation performed

- `node --check server/app.js`, `server/lib.js`, and `server/billing-safety.js` passed.
- `npm run check` passed; static release audit passed and all 29 automated tests passed.
- `npm run pricing:check` passed all four credit-pack margin checks.
- A production Vite build and live GitHub/Google/Flutterwave/provider tests were not performed in this environment. Do not treat the static tests as a substitute for a staged payment and OAuth smoke test.

## Deployment reminders

- Keep server-only credentials on Vercel; do not place service-account JSON, OAuth client secrets, or Flutterwave client secrets in GitHub Pages build variables.
- Keep `FRONTEND_URL=https://wytebot.github.io/pothub/` and `APP_ORIGIN=https://wytebot.github.io` on Vercel, and register `https://pothub-self.vercel.app/api/auth/github/callback` with the GitHub OAuth app.
- Before accepting live card payments, confirm your Flutterwave v4 direct-charge entitlement and PCI compliance requirements. Test a pending payment, each supported authorization method, failed payment, webhook retry, duplicate verification, and credit balance reconciliation in a non-production environment.
