# Pothub audit backlog

The supplied archive did not contain `AUDIT_REPORT.md`; `QUALITY_AUDIT.md` was used as the available source audit. This file records remaining open items rather than implying the missing audit was read.

## Open items carried forward
- Full repository scan remains bounded; diagnosis must state inspected coverage and limitations.
- AI output remains a hypothesis; builds/tests must be independently executed.
- Previous baseline: Supabase was the primary store. The current migration section below supersedes that baseline.
- Full BYOK provider routing is not implemented.
- Refund failures need an operator-visible reconciliation flow.
- Live GitHub/Vercel/Flutterwave/Play, webhook, PWA offline, and Android tests require credentials/device.
- Download-to-public-Downloads MediaStore plugin and native share sheet integration remain incomplete.
- Google Play Billing server verification, acknowledgement, idempotent grant and refund/revocation remain a pre-Play-Store milestone. Per developer instruction, Flutterwave v4 remains enabled in the APK for sideloaded distribution until the Play Store migration is ready.
- Flutterwave v4 direct-charge card fields are still collected by the current UI; card fields are encrypted client-side but this is not equivalent to hosted checkout and must be reviewed for PCI scope before public release. Do not silently substitute the v3 API.
- Alert inbox, repository fix memory/outcome metrics, desktop three-pane layout, command palette, full accessibility checks and Playwright critical-path tests remain incomplete.
- GitHub App migration, team projects and splash plugin setup require additional work/configuration.

## 2026-10-28 update
- Implemented session-only Gemini BYOK settings and `/api/agent/test`; see `docs/AGENT_KEYS.md`.
- Still open: task-specific model quality benchmarking, non-Gemini BYOK providers, automated browser/device E2E tests, and production build validation.


## Runtime audit update (2026-10-28)
- Fixed Inbox JSX parse error and checkout flow being commented out by an inline line comment.
- AI route exhaustion and common quota/rate-limit failures now route to the Use Your Agent setup panel.
- Remaining limitation: dependency installation timed out in the execution environment, so the full Vite production build and live integrations could not be verified.

## Deep review pass — 2026-10-28 (creator-media-flow archive)

### Fixes applied in this pass
- Moved BYO key configuration from request headers into transient POST JSON bodies for operations that need it. This reduces the chance of secrets being captured by proxy/header diagnostics. The API must continue to avoid logging request bodies; no server-side persistence was added.
- Redacted secret-like strings before writing API/provider errors to server logs and limited user-facing error detail.
- Stopped image generation as soon as the requested image count is reached, rather than continuing to call every configured image key and potentially returning extra images or spending extra provider quota.
- Made Firebase Analytics initialization tolerate unsupported/rejected environments instead of allowing a rejected support check to become an unhandled promise rejection.
- Changed agent-test UI wording to accurately state that it checks text connectivity and latency, not image/video support or repair quality.
- Corrected environment documentation: the starter balance is 5 credits, and the minimum/optional Vercel configuration is explained to reduce unnecessary environment variables.

### Findings still open (not safe to claim fixed)
- Creator Google sign-in is not wired end-to-end to the server's current GitHub-session-only `requireUser` and GitHub-keyed credit ledger. Firebase client initialization alone does not provide creator API authentication. This requires a deliberate server-side Firebase ID-token verification and account/credit identity migration.
- Video generation is explicitly unsupported. A provider-specific video adapter, asynchronous job state where required, result retrieval, preview and browser/APK download testing are still needed.
- Flutterwave v4 currently uses encrypted direct card-charge fields rather than hosted checkout. This still needs payment-provider review and PCI-scope assessment.
- The public Downloads native plugin is a template and requires generated Android registration/build plus device tests; APK public-folder permissions and share behaviour are not verified.
- No production frontend build or Playwright run could be completed because dependency installation timed out. No live GitHub/Vercel/Flutterwave/Gemini test was performed.
- Existing AI provider tests measure text response and latency only. They do not establish task suitability, image/video capability, or best repair quality.
- Several major product items remain partial: full repository indexing/deep diagnosis, issue fix memory and outcome metrics, full desktop three-pane layout/command palette, remote event delivery and complete browser/APK compatibility tests.

### Coverage and confidence
The pass reviewed the repository file inventory, server AI routing/credits/auth/payment paths, frontend API transport and major creator/file/project flows, environment documentation, schema and release-audit script. Static checks and the existing five unit tests pass. This is not a claim that every runtime path was exercised: no dependencies were installed, no deployed Vercel project was accessible, and no physical Android device or live provider account was tested.


## Firebase migration update (2026-10-28)
- Replaced the server database client with Firebase Admin + Firestore. Supabase SDK and runtime environment requirements have been removed from the application configuration.
- Ported profile initialization, atomic credit spending/grants, order storage, Vercel token storage, notification subscriptions, deployment monitoring and notification records to Firestore collections.
- Firestore credit changes use transactions and positive credit grants are idempotent by payment reference.
- Added deny-all client Firestore rules and composite indexes because privileged records must only be accessed by the server. Added a one-time guarded migration script that refuses to import into non-empty target collections.
- Important: this source migration does not copy existing production Supabase records. Before switching an existing live deployment, export/import profiles, balances, positive credit ledger references, unpaid orders and encrypted Vercel credentials. Existing paid orders must not be re-granted during import.
- Runtime verification still requires installing dependencies and testing against the actual Firebase project; this environment did not provide the service-account credentials.
