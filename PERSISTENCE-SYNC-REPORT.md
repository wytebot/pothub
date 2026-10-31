# PotHub persistence and account sync update

## Implemented

- Retained Dexie/IndexedDB as the local-first database and upgraded its schema to v5 without deleting existing stores. Schema v5 adds an account-partitioned local cache so account switching preserves unsynced records.
- Requests browser persistent-storage permission (`navigator.storage.persist()`) at startup where supported, reducing browser storage eviction risk.
- Added authenticated `/api/workspace/sync` GET/POST routes backed by Firebase Admin Firestore. Records are stored beneath a SHA-256 account scope, with per-item document IDs, timestamp conflict handling, tombstones for deletions, pagination, payload size bounds, and `Cache-Control: no-store`.
- Syncs saved agents/API provider configurations, prompts, chats, messages, runs, projects, and attachment/video metadata across devices signed into the same Pothub account.
- Saved provider API keys are decrypted locally only for the authenticated sync request, encrypted server-side using AES-256-GCM, and re-encrypted with the local device key when restored. The encryption key is never sent to the browser.
- Sync runs after sign-in, after important save operations, on a 30-second interval, when the app becomes visible, and before page hide/logout on a best-effort basis.
- Local account ownership is tracked; when a different Pothub account signs in on the same browser, outgoing rows are archived under that account and only the incoming account's cached rows are restored. Unsynced records are not deleted during account switching. Known-item manifests are scoped per account.
- Bumped the service worker cache version and removed HTML document caching. Navigations are network-only with `no-store`; only immutable hashed Next.js assets, icons, and the manifest remain cacheable.
- Added `Cache-Control: no-store` to the root page response.

## Required Vercel configuration

Add this server-only environment variable in Vercel Production, Preview, and Development:

`POTHUB_VAULT_ENCRYPTION_KEY`

Generate a strong stable value with:

`openssl rand -hex 32`

Keep exactly the same value across all deployments and do not prefix it with `NEXT_PUBLIC_`. Do not rotate it without first migrating existing encrypted API-key records. `SESSION_SECRET` is a compatibility fallback, but a dedicated vault key is recommended.

Firebase Admin/Firestore must already be configured through `FIREBASE_SERVICE_ACCOUNT_JSON` (or Application Default Credentials). Browser Firestore rules remain deny-all; all sync reads/writes go through the authenticated server.

## Media limitation

Text/metadata records and saved API configurations sync between devices. Binary attachment and generated image/video blobs remain in the local IndexedDB in this pass to avoid uploading large media automatically or creating unexpected Firebase Storage costs. Include media in the ZIP backup when transferring those binary files to another device.

## Cache behavior

The app document is not cached by the service worker or the root HTTP response. Static content-hashed scripts and icons may still be cached because they are immutable and do not restore a prior workspace page.

## Verification

- Workspace vault encryption/account-scope tests: 5/5 PASS.
- Server JavaScript syntax checks: PASS.
- Cloud-sync and Dexie module syntax checks: PASS.
- App JSX TypeScript parser check: PASS.
- Full integration suite and Next production build require npm dependencies; this environment currently has no `node_modules`, so those checks must run in the network-enabled GitHub Actions runner after pushing the project.
- Live Firestore account sync, two-device reconciliation, and Android WebView persistence still require deployment/device testing.

## Biometric and native-key hardening (31 October 2026)

- Native API-page lock metadata and PIN verifier now use Android secure storage. A passcode fallback is enrolled before the native biometric prompt, and passcode-only mode is retained if the biometric prompt is cancelled or unavailable.
- Native key migration now preflights every saved agent record before writing new ciphertext, then updates records and removes the old key in one Dexie transaction. If the key is missing while encrypted agents exist, it fails closed instead of generating a replacement.
- Default-agent changes are transactional. See `FACT-CHECK-PERSISTENCE-BIOMETRIC.md` for the validation matrix and unverified device checks.
