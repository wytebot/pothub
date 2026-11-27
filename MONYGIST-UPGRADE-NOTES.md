# MonyGist upgrade notes

## Included in this source update

- Rebranded the visible app title, metadata, route labels, help copy and docs from Pothub to MonyGist. Legacy app identifiers, storage keys, API routes, OAuth IDs and the existing hosted URL are intentionally retained to avoid breaking installed clients, sign-in and saved data.
- Replaced the PWA icon set with the new MonyGist developer mark and updated the Android notification vector artwork while retaining its resource identifier.
- Restored/kept the AI Providers interface: provider connections, API-key/model setup, backend connection, and provider-specific allowed-email environment-variable names are present in `src/pages/Providers.tsx`.
- `@` repository tags are persistent in the composer. Users can toggle tags off or replace them; the selected tag is saved locally. The picker no longer offers a one-message-only tag mode.
- Repository chat context now includes the complete GitHub file listing plus up to 40 prioritized files, with an aggregate cap of 150k characters per tagged repository and an 80k per-file cap. Orientation files are included if the prompt doesn't identify code paths. Ignored/binary/oversized paths remain filtered.
- GitHub CI runs on pushes to all branches (as well as pull requests and manual dispatch) and executes the existing app tests/build, API tests/typecheck and sandbox-runner tests/typecheck on GitHub-hosted runners. Tagged cloud repairs auto-install the MonyGist workflow/script if absent, dispatch on GitHub Actions, use ordered model/provider fallbacks and retry once after test/build failures before a final verification step.

## Additional 0.16.2 wiring

- Auto-routing now prefers quality-ranked models for coding, production, security, debugging, verification, and research tasks; quick/simple prompts prefer faster models. A last-known-good model is retained for speed-oriented routes, while quality routes start from the ranked quality candidate. Explicit model preferences still take precedence. Provider/model fallback remains active.
- Research crawls up to two verified configured sites per request only when the user has enabled the crawl consent. The configured site pages are added to the evidence/source set, and citations link directly to the pages. Consent is read from the existing configured-site local setting.
- The AI backend accepts valid case-sensitive custom environment-variable names as entered (including lowercase and underscore-leading names), while rejecting reserved platform/system names. Model variables accept ordered comma-separated model IDs and the backend falls back across those models.
- Project ZIP artifacts are retained in local artifact storage and are not offered as a download button in chat. A GitHub commit action can commit the ZIP contents, including supported binary assets, into an existing repository or create a new private/public repository first. GitHub commit upload uses bounded parallel blob creation and size/file-count limits.
- Codelab editor tools include JSON formatting, comment/uncomment for supported file types, whitespace cleanup, and terminal commands `find`, `grep` (open/staged files only), `wc`, and JSON validation. The sandbox remains a browser sandbox, not an OS shell.
- The App appearance page was removed from navigation and the page module removed; automatic/system dark/light theme remains. Icons inherit text color and align consistently across themes.
- Chat platform actions now include confirmed non-sensitive GitHub variable writes, workflow dispatch, workflow-run status, Vercel plain-variable writes, and deployment listing. Tagged coding/repair requests auto-install missing MonyGist workflow/runner files without overwriting unrelated files, then dispatch the GitHub-hosted job. GitHub actions require an `@` repository tag; Vercel actions use the saved selected project. Sensitive variable names are rejected.
- Pro features/limits are documented in Billing: five configured websites, unlimited daily analysis/background-analysis quota, full GitHub repo listing, while the 20-file per-message cap and Free core features remain.

## Not completed in this update

- Full Claude-class coding behavior is not a model-level guarantee. The app currently relies on the configured AI providers; coding quality is improved by explicit repository-agent instructions and richer context, but no new proprietary reasoning model is bundled.
- Repository context is still bounded and prioritized, not a complete copy of every file in arbitrarily large repositories. An agent-driven follow-up fetch tool or cloud runner is needed to fetch additional exact files on demand.
- Repair/fix actions are not yet converted into a GitHub Actions dispatch workflow. Existing Analyze/Fix and repository write flows remain in the app/backend architecture; this CI workflow verifies commits remotely but does not itself perform the agent's repair. A full GitHub-hosted repair runner requires a workflow template in each target repository or a centrally hosted runner with scoped credentials, secure provider-key handling, job status/result transport, approvals for writes, and a dispatcher integrated into chat.
- Natural-language GitHub Actions/Vercel variable writes from chat, including confirmation-first agent actions, are still not fully wired in this update. This requires dedicated permission-checked API methods, variable classification/validation, explicit confirmation before writes, and UI/job results. Do not send secrets through plain variables.

## Verification

The project build/test commands are configured in GitHub CI. Local dependency installation timed out, so the production build and full Vitest suites could not be executed. TypeScript transpile-only syntax diagnostics passed for all edited TS/TSX modules. API gateway custom-variable and comma-separated model-fallback behavior was exercised with direct Node assertions. A full CI run is still required before production deployment.
