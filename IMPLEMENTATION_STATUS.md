# Pothub implementation status

## In this revision
- Compact navigation: primary destinations stay visible and History/Settings/Help move into a More menu on mobile.
- Sidebar preferences are collapsible so secondary actions do not crowd the workspace.
- IndexedDB database is now named `pothub-local`; a one-time migration copies existing Kithub-local projects, tasks, settings, credit events and reports where the new stores are empty.
- Existing JSON backup export/import and optional Google Drive backup/restore remain available. The Vercel token is excluded from JSON backup.
- Existing AI-credit accounting is fail-closed when Supabase is unavailable; do not switch it back to demo balances.

## Product rules to preserve
- Users' own provider keys must not consume Pothub AI credits. Pothub credits apply only when a Pothub-managed AI provider is used.
- BYOK should default to session-only and must not be sent to logs, analytics, IndexedDB, backups, or persisted in server databases. A short-lived worker may receive it only when necessary, and must not persist it.
- Agent progress should reflect actual tool events and task states, not fabricated timer-based progress.
- Repository operations, shell/build commands and package scripts must execute in an isolated sandbox with limits. User-provided repository code is untrusted.
- IndexedDB is the default for project history and generated files. JSON download/import is the portable backup. Google Drive is optional and user-authorized.
- Supabase is currently the required primary server database for accounts, credit ledger/orders, repair tasks, notifications and Vercel connections. Firestore fallback is **not yet wired into all server persistence paths**; do not claim it is active until a complete adapter and migration tests are added.

## Not verified / still required before public launch
- A full Bring Your Own Key Dev Studio UI and direct provider routing are not yet fully implemented.
- Firestore fallback for server-side records is not implemented end-to-end.
- Production build, live OAuth, payment, PWA offline and Android APK/device tests must be run after dependency installation and environment setup.
- The 60% profit margin needs measured provider and infrastructure costs; the current credit pack quantities do not prove it.
