# Pothub compatibility matrix

**Verification legend:** Source = inspected; Static = syntax/audit/test; Live = exercised with a real provider/device. No live credentials or Android device were available in this environment.

| Action | Browser / PWA | Standalone Capacitor Android | Status |
|---|---|---|---|
| GitHub sign-in | OAuth authorization-code flow, state + PKCE, HTTP-only session cookie | System browser and `ai.pothub.app://auth` one-time ticket | Static only; real OAuth callback still needs test |
| Google sign-in | Firebase redirect and server session/profile provisioning | System-browser Google OAuth and deep-link ticket | Static only; requires Google OAuth/Firebase config |
| Diagnosis / fix | Repo picker, workflow job/step summary, file selection, progress, unified diff | Same React code path | Static only; GitHub repository test required |
| Commit / PR | Creates a new branch and supports explicit PR creation | Same remote API | Static only; disposable repo test required |
| Creator chat | Markdown/code highlighting, text/image attachments, history, media cards | Same UI, native share/save adapter | Static only; provider tests required |
| Image generation | Gemini image adapter; generated images persisted as Blobs | Same remote API and local Blob storage | Static only; valid image-capable model required |
| Video generation | Gemini Interactions API background job, polling, authenticated Vercel API streaming, local job persistence, result Blob and idempotent delivery charge | Same API, job resume on relaunch, cancel route | Static only; live Gemini Omni Flash operation and local-cancel behavior need testing |
| Agents / API keys | AES-GCM + non-extractable WebCrypto key in IndexedDB | AES-GCM key stored using Keystore-backed secure storage | Static only; native plugin sync and device test required |
| API page lock | Optional WebAuthn platform authenticator | Optional native biometric prompt | Static only; device verification required |
| Backup | JSON metadata or ZIP with media Blobs; preview before restore | Uses native save adapter | ZIP unit-tested; full IndexedDB round-trip not yet live-tested |
| Payments | Flutterwave v4 encrypted card payload, authorization and server verification | Same flow for current APK distribution | Static only; sandbox transaction and webhook replay tests required |
| Offline start | Cached PWA shell; local history/media available | Cached Capacitor web assets and IndexedDB | Static only; offline launch test required |

## Limits
Remote diagnosis, AI, GitHub operations, payments and video polling require connectivity. The Actions run selector attempts bounded extraction of raw logs from GitHub's log archive and appends job/step summaries; users can still paste raw logs if the archive is unavailable. No row is marked Live until exercised against actual credentials and a device.
