# Pothub compatibility matrix

**Verification legend:** Source = inspected implementation; Static = automated source check; Live = exercised against a real provider/device. No live credentials or Android device were supplied with this repository, so no row below is marked Live.

| Action | Browser / PWA | Standalone Capacitor APK | Verification / limitation |
|---|---|---|---|
| GitHub connect | OAuth redirect and HttpOnly session cookie | Native deep-link handoff (`ai.pothub.app://auth`) when Android intent filter is configured | Source inspected; static only. Requires GitHub OAuth callback URL and Android install test. |
| Vercel OAuth connect | Server starts OAuth and stores encrypted token in Supabase | Opens provider flow and returns through app scheme when configured | Source inspected; static only. Requires Vercel OAuth app and redirect URI. |
| Diagnose | Calls server API; needs network, GitHub and configured AI provider | Same remote API; needs network | Source inspected. Not a full repository proof; only bounded selected context/logs. |
| Repair proposal | Preview proposal and accept to a new GitHub branch | Same remote API and branch workflow | Source inspected. AI output is a proposal, never verified by generation alone. |
| Commit to branch | GitHub API creates a new repair branch | Same, if OAuth session survives native handoff | Static only; disposable repository test required. |
| File generation | Server generates text/PDF/DOCX/XLSX and returns content/base64 | Same server generation | Static only; parser validation and live request still required. |
| Downloads | Blob URL browser download | Current fallback writes under app Documents/Pothub; public Downloads/MediaStore plugin is not yet integrated | Browser source inspected. APK public Downloads is **partial/blocked** until native plugin is added and device-tested. |
| Backup/restore | Local IndexedDB history; JSON export/import availability depends on current UI | Local WebView IndexedDB; export via browser-like download path is limited | Source inspected; offline and restore tests required. |
| Drive backup | Requires user-supplied Drive configuration/token | Requires browser/native OAuth setup; manual token workflow may not survive provider policy changes | Not live verified; needs Google OAuth/Drive setup. |
| Notifications | Web Push requires VAPID and subscription endpoint; foreground toast works locally | Local notifications supported; remote push requires Firebase credentials and native setup | Source inspected; actual background delivery not verified. |
| Legal links | Static `/legal/*.html` pages | Open in app webview unless explicitly sent to system browser | Source inspected; APK external-open behavior needs device test. |
| Purchases | Flutterwave checkout path on server | **Must use Google Play Billing for digital credits**; this repository does not yet contain a verified Play Billing purchase/token-validation/grant implementation | Web flow is not live verified. APK purchases are blocked until Play Billing code, Play Developer API credentials, acknowledgement, revocation and sandbox tests are complete. |

## Offline expectations
Only saved local history/files can be available offline. Diagnosis, logs, AI, branch commits, payment verification, remote backups and background monitoring require a connection. Pothub must not show stale cached responses as successful remote operations.

## October 28 update

| Action | Browser / PWA | Standalone Capacitor APK | Verification |
|---|---|---|---|
| Flutterwave credit purchase | Existing Flutterwave v4 direct-charge UI and server verification | Same Flutterwave v4 flow enabled; redirect actions open with Capacitor Browser | Static code review only; no configured sandbox transaction run in this environment |
| Inbox | Displays saved local diagnosis findings and opens the related project | Same bundled UI and IndexedDB data | Static review; no device test |
| Legal links | Opens legal page in browser tab | Opens legal page using Capacitor Browser | Static review; must verify with deployed origin/device |

The APK purchase path intentionally uses Flutterwave for now, at the developer's request. Before publishing a Play Store build, replace this in-app digital-credit purchase path with compliant Google Play Billing and server-side purchase-token verification. Do not submit the Flutterwave-in-APK version to Google Play without reviewing current Play policy and the app's distribution configuration.
