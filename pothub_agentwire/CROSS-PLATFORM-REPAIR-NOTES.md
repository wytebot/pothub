# Cross-platform repair pass (2026-10-31)

## Applied
- BYOK agent routing now resolves to zero PotHub credits for the shared `chargedModelJson` workflow; platform-hosted AI remains server-priced.
- BYOK repair proposal settlement skips platform credit reservation/commit/release.
- Billing policy tests now assert zero PotHub credit charge for BYOK diagnosis, repair, chat and Creator image route pricing.
- Release source audit now asserts zero BYO service fee values.

## Verified in this environment
- `node --check server/app.js`
- `node --check server/billing-policy.js`
- `node --test tests/billing-policy.test.mjs tests/backup.test.mjs` (6 passed)
- `node scripts/release-audit.mjs` (static source audit passed)

## Explicit remaining blockers — do not treat this ZIP as production certified
- Creator image generation and video delivery still contain separate legacy `Math.max(1, BYO_SERVICE_FEES.creator)` reservations and need a proper no-charge/idempotent operation path. They were not silently bypassed because the existing settlement state machine assumes a reservation object.
- No `package-lock.json` exists. `npm install --package-lock-only` timed out in this environment; pinning an unverified lockfile would be unsafe.
- Full dependency install, `npm run build`, `npm run build:cap`, Android Gradle build/device tests, browser OAuth, live provider calls, large Git commits, Vercel deploy/log streaming, and media delivery were not run.
- Capacitor exports a static frontend; all `/api/*` routes require `NEXT_PUBLIC_API_BASE` to point at the deployed HTTPS backend. Do not leave it empty in standalone APK production builds.
- Browser and Android runtime parity cannot be certified by source checks alone.
