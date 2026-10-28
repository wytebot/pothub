# Pothub audit backlog

The supplied archive did not contain `AUDIT_REPORT.md`; `QUALITY_AUDIT.md` was used as the available source audit. This file records remaining open items rather than implying the missing audit was read.

## Open items carried forward
- Full repository scan remains bounded; diagnosis must state inspected coverage and limitations.
- AI output remains a hypothesis; builds/tests must be independently executed.
- Supabase is required primary storage; no end-to-end Firestore fallback is implemented (and no second database is being added).
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
