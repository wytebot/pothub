# PotHub persistence and biometric fact-check — 31 October 2026

## Issues found in the previous persistence release

1. **Account switching could erase offline changes.** The sync routine cleared the previous account's local tables as soon as a different account signed in. If the previous account had unsynced records, they were lost locally.
2. **Native biometric fallback was incomplete.** The native enrollment path saved only `{mode:'native'}`. If the biometric plugin later became unavailable or the user cancelled the OS prompt, the fallback verifier had no PIN hash or server PIN marker to use.
3. **Native lock metadata was kept in ordinary IndexedDB.** API-agent lock metadata and local PIN verifier were not stored in Android secure storage.
4. **Native API-agent key migration was not crash-safe.** The previous migration could write the new secure-storage key before all agent records had been decrypted and re-encrypted. An interrupted migration could leave a mixed set of ciphertexts.
5. **Cloud sync's deletion cursor state was shared across accounts.** A single known-item marker was used for all signed-in accounts.

## Changes in this pass

- Dexie schema v5 adds `accountCache` with account, table, item and update-time indexes.
- Account changes now archive the outgoing account's current local rows and restore only the incoming account's cached rows. Unsynced work is preserved instead of being cleared.
- Cloud sync known-item manifests are account-scoped. The previous single manifest is read as a compatibility fallback only for the currently recorded owner.
- Native API-page lock records and PIN salt/hash are stored through `@aparajita/capacitor-secure-storage`; legacy IndexedDB lock records are migrated on first read.
- Native enrollment always creates a 6–12 digit fallback PIN before attempting the OS biometric prompt. If the prompt is unavailable/cancelled, the page remains protected by passcode-only mode rather than an unusable biometric-only lock.
- Native unlock uses the PIN when the saved mode is passcode-only, or when biometric hardware is unavailable; biometric prompt failures fall back to the saved PIN.
- Browser WebAuthn continues to use server-side credential verification and server-side PIN verification. API security requests explicitly include the active session bearer token when available.
- Native API-key migration now decrypts and validates all saved agent records before writing any replacement ciphertext. It writes the new key only after successful preflight, commits all agent rows and deletes the legacy key in one Dexie transaction, and leaves the legacy key available if secure storage is unavailable.
- Saving a default agent now updates the default flags and writes the new agent in one Dexie transaction.
- Added a release-audit requirement for account partitioning, biometric fallback routing, and the v5 schema.

## Automated validation performed

- All `.js` and `.mjs` files under `server`, `scripts`, `tests`, and `src/lib`: `node --check` PASS.
- `src/ui/App.jsx`: global TypeScript parser (`tsc --noEmit --allowJs --checkJs false --jsx preserve --noResolve --skipLibCheck --target ES2022 --module ESNext`) PASS.
- Release source audit: PASS.
- Focused persistence, account-isolation, encryption and biometric policy tests: 10/10 PASS.
- Full `npm test`: 61 PASS, 16 BLOCKED because `node_modules` is absent (`express`, `firebase-admin`, `typescript`, and other dependencies cannot be imported). These are dependency-resolution failures, not confirmed feature failures.

## Not verified in this environment

- A production Next build and Capacitor/Android build. Dependency installation is unavailable here and the previous release already had the PDF.js worker dependency blocker.
- Real Firestore synchronization across two separate signed-in devices, account switching while offline, and conflict resolution under concurrent edits.
- Real Android biometric prompts, PIN entry UX, secure-storage plugin behavior on supported Android versions, and process-kill/restart behavior on physical hardware.
- Live WebAuthn registration/authentication on the production origin.

## Operational safety notes

- Keep `POTHUB_VAULT_ENCRYPTION_KEY` stable across deployments. Rotating it without migrating cloud ciphertext makes previously synced API keys unreadable.
- Do not clear Android app data or uninstall the app during a native key migration. A missing secure-storage key with existing encrypted agent records now fails closed rather than generating a replacement key.
- Binary attachments and generated image/video blobs remain device-local; their metadata syncs. Use ZIP backup to transfer those blobs.
