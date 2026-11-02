# Firebase Google login restoration fix

## Symptom
Google login succeeds, then PotHub returns to the welcome screen with `Failed to return authenticated user`.

## Changes
- Startup restoration now recognizes a Google Firebase user from `providerData`/`providerId`, even when Dexie `preferred-role` is absent.
- Startup always restores Creator workspace after a valid Google session exchange, including when the exchange session token already exists.
- The ID-token listener uses the same Google provider inference and explicitly errors if the exchange returns no user.
- Preserves the existing single-flight Firebase exchange keyed by ID token.
- Adds regression tests for role-row-independent restore, listener validation, and single-flight behavior.

## Verification
- Focused regression test: 3/3 passed.
- `node --check server/app.js`: passed.
- `node --check server/lib.js`: passed.
- `node scripts/release-audit.mjs`: passed.
- `npm run check`: failed overall because dependencies are not installed in this environment. 132 tests passed and 16 test files failed to load due missing `express`, `firebase-admin`, and `typescript` packages. This is not a successful full-suite result.
- Google OAuth, deployed Vercel, Firebase Admin verification and real browser/PWA/Capacitor restoration still need live testing.
