# PotHub hardening pass — 2026-11-03

## Root causes found and changes made

1. **Task leakage in fallback routing.** `requestAgentConfig()` accepted legacy `task: all` candidates for every endpoint. It now normalizes task aliases and selects only the exact route task. A text route cannot borrow an image, video, or sibling text task's configured agent.
2. **Platform-funded model maintenance.** `server/model-catalog.js` contained a Gemini-powered documentation analysis call using `GEMINI_API_KEY` and a default `GEMINI_DOCS_MODEL`. The AI-backed refresh was removed; the catalog preserves cached lifecycle evidence and does not run platform-owned inference.
3. **BYOK startup resilience.** Legacy platform AI key variables produce a warning but do not block startup; AI requests still only use configured user-agent candidates.
4. **Provider error classification mixed quota and rate limiting.** Rate limits now have a separate retryable classification; quota/billing and safety errors stop rather than being treated as generic transient failures. Model-unavailable errors may advance only through the already-selected same-task candidates.
5. **Raw provider detail shown for exhausted candidate lists.** Exhausted configured-agent routes now return a short actionable message and request ID; detailed bounded diagnostics remain server-side.
6. **Pricing assumptions incorrectly charged PotHub for inference.** Replaced `aiCostPerCreditUsd` and `aiSafetyFactor` with an explicitly labelled infrastructure placeholder, new packs and per-action infrastructure prices. The pricing check fails below a 50% margin plus a 0.5 percentage-point buffer under the worst listed channel fee.
7. **Model catalog had a latent reference bug.** `status()` previously called `opts.modelIds` although `opts` was not in scope; it now passes the explicitly destructured `modelIds`.
8. **Intent/capability primitives were missing as a reusable server-side contract.** Added `src/lib/request-planner.js` for deterministic intent classification and strict exact-task/workspace/key/model-capability planning, with focused tests. This is a foundation and is not yet wired as the single orchestrator for every existing chat, Codelab, media and file endpoint.

## Pricing review: server values before vs proposed values

Old server pack economics used provider-cost assumptions (`$0.006` per credit including the safety multiplier), infrastructure `$0.05/order`, Play 30%, and web 3.5% + `$0.30`. New economics set PotHub inference cost to `$0`, use `$0.0015/credit` infrastructure (PLACEHOLDER) plus `$0.05/order`, and keep the same channel fee assumptions.

| Pack | Old server credits | New credits | Price | Old worst-channel margin | New worst-channel margin |
|---|---:|---:|---:|---:|---:|
| Starter | 60 | 200 | $1.99 | 49.40% | 52.41% |
| Developer | 150 | 600 | $4.99 | 50.96% | 50.96% |
| Professional | 300 | 1,200 | $9.99 | 51.48% | 51.48% |
| Power | 600 | 2,400 | $19.99 | 51.74% | 51.74% |

**Important:** the old `docs/PRICING.md` displayed 24/74/158/324 credits while `server/pricing.js` priced 60/150/300/600. That inconsistency is documented as a root cause; the new server and docs values now agree. The infrastructure unit cost is a placeholder and must be replaced with measured invoices. If measurement makes a pack miss the target, lower credits rather than lowering the target margin.

## PotHub-owned AI removal status

- Removed the server-side Gemini model used for model-catalog documentation analysis.
- Removed the configurable platform AI cost model from pricing.
- Added a startup/runtime guard against legacy platform AI key environment variables.
- Removed task-wide fallback candidates from request routing.
- Updated active settings copy to “Bring your own AI. PotHub orchestrates it.”
- Removed the old `GEMINI_API_KEY` and fallback-key configuration entries from the environment guide, replacing them with a BYOK-only migration warning.

This pass does **not** claim a full removal audit across every historical changelog, store listing, legal document, and every legacy UI path. The new audit script checks direct platform-key reads and provider declarations, not all possible prose mentions.

## Known incomplete acceptance criteria

- A single request planner is not yet wired end-to-end through every existing endpoint; mixed text/image/video/file requests are not yet orchestrated into a dependency-aware plan with resumable progress.
- Agent keys are still decrypted in the client from the local encrypted store and transmitted transiently over authenticated HTTPS. They are not yet exclusively server-vaulted/decrypted at call time; this is a security architecture migration, not completed here.
- Developer/Creator agent ownership is not yet server-authoritative because existing agents are client-supplied in request payloads. The new planner primitive supports scope filtering but existing persistence and routes need a server-owned agent-record migration.
- Automatic resume after saving a missing agent, all-format output delivery, signed URLs for every output type, durable media orchestration across restart, and every UI error boundary/race condition are not all implemented by this pass.
- The complete production build and full test suite could not be verified because dependency installation timed out in this environment. Only the focused dependency-free tests and static checks listed in the delivery report were run.

This is a partial hardening artifact, not a certification that all requested production acceptance criteria pass.

## Verification outcome

Focused suite passed 40/40. Static release and BYOK audits passed. The full suite is not green: 217 tests were discovered, 188 passed and 29 could not run successfully because dependencies such as `express`, `firebase-admin`, and `typescript` were unavailable after `npm install` timed out. Production build stopped before Next.js compilation because the PDF.js worker was missing. Therefore the full production acceptance checklist remains unverified.


## Follow-up implementation — 2026-11-03

1. **Natural-language image prompt missed the image path.** Creator routing now recognizes direct drawing requests such as `draw a cat astronaut`, even when the user does not include the word “image”. The image generation function now receives the prompt explicitly rather than relying on a React state update before reading it, avoiding a stale-prompt race. Its error path no longer references undefined `overrideText` / `currentText` variables.
2. **Text endpoint could be asked to generate media directly.** `chargedModelJson()` now runs an intent preflight on Creator and Developer chat routes before agent resolution, credit reservations, or provider calls. Explicit image/video output requests return `NEEDS_AGENT` with the exact capability list and `creditsCharged: 0`; they do not get sent to a text model. Dedicated media routes remain responsible for actual media generation.
3. **Planner regression coverage.** Added tests for natural-language drawing intent and video generation intent.

This follow-up improves the media-routing boundary, but does not complete the multi-agent mixed-output orchestrator or durable resume workflow. Those remain explicitly incomplete.

## Follow-up hardening — 2026-11-03 (workspace/task isolation)

4. **Fallback helper still accepted unscoped/`all` candidates and sibling fallback input.** `src/lib/agent-routing.js` now rejects unscoped and `all` task candidates and deliberately ignores sibling-task fallback arrays. Added regression coverage for this policy.
5. **Workspace scope was absent from normalized candidate payloads.** Agent records now carry a `workspace` field, client candidate normalization preserves it, Creator/Developer request selection filters local records by workspace, and the server rejects candidates whose explicit workspace does not match the request header. Existing unscoped records migrate to `developer` without modifying their encrypted secret or duplicating records. This is a client-side isolation plus request-payload validation step; it is not a substitute for a server-owned agent registry, because clients still supply the transient credentials.
6. **Creator missing-agent recovery was a dead end.** The Creator missing-agent card now offers a Creator-scoped configuration path. Image/video requests preserve the prompt and retry after a newly saved Creator agent is available.
7. **Provider failures could leak provider-specific raw messages to the UI.** The common API error response now maps recognizable auth, quota, rate-limit, safety and transient provider failures to short actionable messages while retaining the request ID for server-side diagnosis.
8. **Workspace UI mixed agent inventories.** Creator workspace components now receive only Creator-scoped agents; Developer components receive Developer-scoped agents. The Creator settings page links directly to its own API & Agents view.

## Remaining hard blockers (still not certified)

- The server still receives BYOK credentials in transient request payloads; the vault is used for cloud sync encryption but keys are still decrypted by the client for editing/calls. Server-only key custody is not complete.
- A malicious client can forge the `workspace` label in a request because the authoritative agent record and credential fingerprint are not yet stored and resolved server-side. UI separation and payload checks reduce accidental leakage but do not provide a complete authorization boundary.
- Multi-capability plans, dependency-aware execution, resumable durable step records, automatic resume after missing agent setup for all mixed requests, and unified output delivery remain partially wired rather than complete.
- No actual provider API keys were available to verify real image/video output, and no production build/Capacitor build was completed.

## Follow-up: server-side agent registry wiring

- AI agent resolution now supports saved agent IDs. The server looks up each agent in the authenticated account's Firestore workspace, checks its task and workspace, decrypts the key on the server, and retains the saved provider/model/endpoint binding.
- Text/chat, diagnosis, repair, image, and agent-test client flows now submit agent IDs instead of decrypted API keys.
- Workspace sync responses no longer include encrypted or plaintext agent key material; they expose only `keyConfigured` metadata.
- Metadata-only sync preserves an existing server-encrypted key, and cloud restore preserves any local encrypted key rather than replacing it with missing key material.
- Added regression tests for server registry resolution and secret-free sync responses.
- Remaining migration work is explicitly documented in `SERVER-SIDE-AGENT-REGISTRY.md`: the legacy key-payload compatibility path and current client-side video flow still need conversion before complete server-only custody can be claimed.
