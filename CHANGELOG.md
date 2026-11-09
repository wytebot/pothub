## 2026-11-04 (r2) - Remove "add a video agent" message; release revision

- Any provider or model can be used: OpenAI-compatible, Anthropic-compatible and Azure OpenAI custom endpoints are now enabled (they were switched off with `implemented:false`); model IDs remain free text; the server's model ID limit is 180 characters like the other routes (src/lib/provider-registry.js, server/app.js).
- Fixed server/model-catalog.js: `status()` read an undefined `opts`, so documentation refreshes never ran. Added a `deps.discover` test hook. The module is imported but not used to filter live model lists.
- Media adapters: added a generic OpenAI-compatible image adapter (`/images/generations`, b64 or URL results, Azure `api-key` header, SSRF-pinned, 15 MB cap, MIME sniffing) for the `openai-compatible` and `azure-openai` providers, which now advertise Image. Fixed the agent Test button: OpenAI image agents were tested with a chat call, and Runway/Luma/Replicate/Kling video agents always failed with "not wired". They now use non-billable key checks (`verifyVideoProvider`). New tests: tests/media-adapters-custom.test.mjs.
- Pipeline gate: repaired the 9 failing source-regex/stale tests that would stop the GitHub Actions deploy (OAuth scope, reservation cleanup, configure-agent card, WyteLab menu, Chat AI wiring, 4 model-catalog tests). Tests now assert behavior, not exact source strings.

- A missing Video agent no longer shows any "add/configure a video agent" toast, popup state or error text. Video-intent prompts without a Video agent fall through to Chat (src/ui/App.jsx routeMediaIntent, generateVideo, imagePromptVideoChain, retryVideoResult, resumeVideoJobs; src/ui/WorkspaceSection.jsx Resume button).
- Server chat prompt no longer tells the model to send users to add an Image/Video agent (server/app.js).
- /api/version sourceRevision is now `pothub-no-video-agent-message-2026-11-04-r2` so a live deployment can be told apart from an old one.
- Tests: updated the routing assertion in tests/intent-routing-and-delivery.test.mjs, added a no-video-message test, made the sourceRevision test pattern-based.

# One-pass audit changelog — 2026-11-01

**Important honesty note:** “Fixed (source)” means a source change and a focused regression assertion exist; it does not mean the browser, provider, OAuth, Firestore, billing or APK flow was live-tested. “Needs live test” includes items whose source change is incomplete or whose behavior requires credentials/device verification; the evidence column says which. No item is silently represented as complete.

| ID | Status | Evidence / current result | Files touched | Test |
|---|---|---|---|---|
| A1 | Fixed (source); needs live test | Startup now waits for `authStateReady()` before Creator restore. | `src/ui/App.jsx` | A3/A4 source test covers readiness; live PWA relaunch needed |
| A2 | Fixed (source); needs live test | Firebase auth domain uses the app host on non-local/non-preview hosts; proxy rewrite retained. | `src/lib/firebase.js`, `src/lib/auth-domain.js`, `docs/AUTH_FLOW.md` | A2 auth-domain pure test; verify Firebase console/live redirect |
| A3 | Fixed (source); needs live test | Redirect intent moved to localStorage with 10-minute TTL; URL marker is also checked and missing auth shows actionable error. | `src/ui/App.jsx` | A3 source test |
| A4 | Fixed (source); needs live test | Firebase exchange is single-flight per ID token; Google provider can infer Creator role if preferred-role row is absent. | `src/ui/App.jsx` | A4 source test |
| A5 | Needs live test | Startup error no longer swallows `Failed to fetch`, but startup stages are not yet fully isolated from every auth/database failure. | `src/ui/App.jsx` | No dedicated independent-stage regression test; live fault injection needed |
| A6 | Fixed (source); needs live test | Same-origin GitHub browser exchange sets HttpOnly `pothub_sid`; cross-origin returns opaque bearer ID; GitHub token is encrypted in Firestore session records. | `server/app.js`, `server/lib.js`, `src/ui/App.jsx`, `docs/AUTH_FLOW.md` | A6 source test; needs Firestore cookie/session/revocation test |
| A7 | Partial; needs live test | GitHub and Google native callback/start failures can deep-link with error codes; native state/error return needs live OAuth validation. | `server/app.js`, `src/ui/App.jsx` | A8 source test; no live Custom Tab test |
| A8 | Partial; needs live test | Native exchange is rate-limited; app URL handling checks scheme/host, error parameter, cancellation and cold-start launch URL. Native opaque session is returned by exchange. Some server-side native ticket/session cleanup and full logout revocation remain unverified. | `server/app.js`, `src/ui/App.jsx`, `tests/one-pass-regressions.test.mjs` | A8 source test; live device test required |
| A9 | Needs live test | Two Capacitor back-button listeners remain in source; modal/nav/root priority is not fully unified. | `src/ui/App.jsx`, `src/ui/WorkspaceSection.jsx` | No regression test; Android back test required |
| A10 | Needs live test | Logout still awaits sync before clearing all account-bound state and local Dexie rows; complete account-switch purge/time-box remains incomplete. | `src/ui/App.jsx`, `src/lib/cloud-sync.js` | Existing account-partition tests only; logout race test needed |
| A11 | Partial; needs live test | Creator sidebar/profile menu hides Developer-only Codelab/Launchpad/Free tools; Vercel panel is role-gated. Direct-section/server route guard still needs live role-boundary testing. | `src/ui/App.jsx`, `src/ui/WorkspaceSection.jsx`, `docs/CODELAB-NOTES.md` | Source check only; live Google/GitHub role test needed |
| A12 | Partial; needs live test | `read:org` was removed. Repository deletion remains dependent on an explicit `delete_repo` reauthorization flow and must not be considered wired. | `server/app.js`, `docs/AUTH_FLOW.md` | A12 source test; GitHub permission test needed |
| A13 | Fixed (source); needs live test | Global handlers preserve actual error text where available; auth/session/OAuth messages do not auto-dismiss. | `src/ui/App.jsx` | A13 source test |
| B1 | Needs live test | Create flow now keeps success visible, but transient tree retry/backoff and “Initializing repository…” state are not complete. | `src/ui/CodelabWorkspace.jsx`, `src/ui/App.jsx` | No transient GitHub API test |
| B2 | Partial; needs live test | Create response includes normalized owner/id/description; held repo refresh lock now shows a notice rather than silently returning. Optimistic insertion/eventual-consistency reconciliation is incomplete. | `server/app.js`, `src/ui/App.jsx` | B3 name tests; live GitHub creation test needed |
| B3 | Partial; needs live test | Client/server reject `.`/`..`/`.git` names; refresh failure after creation is non-fatal and success panel remains mounted. Copy is corrected to describe Vercel as conditional. | `src/ui/CodelabWorkspace.jsx`, `server/app.js`, `docs/CODELAB-NOTES.md` | B3 name pure test; live create test needed |
| B4 | Partial; needs live test | Slash-separated branch refs are allowed and unsafe segments rejected. Tree truncation/cap reporting and a virtualized searchable file picker are not complete. | `server/app.js`, `src/lib/auth-domain.js`, `tests/one-pass-regressions.test.mjs` | B4 branch pure test |
| B5 | Partial; needs live test | Chat history strips fenced code and is bounded; “Fix it in chat” log context reduced to fit route limits. Server history cap and all edge-size cases still need tests. | `src/ui/WorkspaceSection.jsx`, `server/app.js` | No dedicated payload-boundary test |
| B6 | Needs live test | Zod error formatter still needs field/message-specific verification and test coverage. | `server/app.js` | No regression test |
| B7 | Partial; needs live test | Developer chat prompt now requests JSON `{text}` to match JSON-mode schema. Truncation/finish-reason detection, syntax validation and commit gating are not complete. | `server/app.js`, `src/ui/WorkspaceSection.jsx` | Source-only; no model truncation/commit test |
| B8 | Fixed (source); needs live test | Off-topic words only refuse when developer intent is not detected; refusal path returns zero credits. | `server/app.js` | B8 source test; add route-level billing test |
| B9 | Partial; needs live test | “Propose repair” is wired and requires an explicit selected target file when diagnosis lacks one. Review/commit path still needs integration tests. | `src/ui/App.jsx`, `src/ui/WorkspaceSection.jsx` | Source-level only; GitHub repair test needed |
| B10 | Needs live test | Branch-name mismatch and Actions run matching by head SHA/created time are not fully repaired in this pass. | `server/app.js`, `src/ui/App.jsx` | Existing route not exercised; GitHub Actions test needed |
| B11 | Fixed (source); needs live test | Diagnosis/video click handlers use wrappers instead of passing the click event as an operation argument. | `src/ui/WorkspaceSection.jsx` | Source-level inspection; React interaction test needed |
| B12 | Needs live test | Credits/image-count context is still not comprehensively audited; progress timer behavior remains unverified. | `src/ui/App.jsx`, `src/ui/WorkspaceSection.jsx` | No React integration test |
| B13 | Needs live test | Binary-safe GitHub commit, mode preservation, deletes/renames and base-blob SHA conflict protection remain incomplete. | `server/app.js` | No Git object mutation test |
| B14 | Needs live test | Creator prompt library is still duplicated between localStorage and Dexie in `WorkspaceSection`; unification is incomplete. | `src/ui/WorkspaceSection.jsx`, `src/lib/db.js` | No migration regression test |
| C1 | Fixed (source); needs live test | Video prompt override accepts only strings; click events fall back to the controlled prompt. | `src/ui/App.jsx`, `src/ui/WorkspaceSection.jsx` | Source-level inspection; video provider test needed |
| C2 | Fixed (source); needs live test | Edit is shown only for user messages; assistant regenerate resends the preceding user prompt. | `src/ui/WorkspaceSection.jsx` | C2 source test |
| C3 | Partial; needs live test | Failed chat requests restore the prompt and chat upsert preserves title/createdAt. Persist-before-request and full message ordering still need completion. | `src/ui/App.jsx` | No failure-injection chat test |
| C4 | Fixed (source); needs live test | Creator and repository-edit composers guard IME composition; touch keyboards keep Enter as newline and Ctrl/Cmd+Enter sends. | `src/ui/WorkspaceSection.jsx` | C4 source test; Android IME test needed |
| C5 | Partial; needs live test | Attachment selection appends, resets input value and accepts extension fallback. PDF Android open/download fallback and APK `out/pdf.worker.mjs` verification are not complete. | `src/ui/WorkspaceSection.jsx`, `scripts/build-capacitor.mjs` | Source-level only; build/device test needed |
| C6 | Partial; needs live test | UI defaults no longer suggest the reported invalid Gemini model IDs; video setup uses a declared Replicate video model. Registry still contains model IDs that require official/live catalog verification and is not fully unified across adapters. | `src/ui/WorkspaceSection.jsx` | Existing provider registry tests; official/live catalog test needed |
| C7 | Needs live test | Agent test task/protocol branch order remains to be audited and tested for image/video providers. | `server/app.js`, `src/ui/AgentsWorkspace.jsx` | No provider test matrix run |
| C8 | Needs live test | Gemini thinkingConfig compatibility retry is not implemented/verified in this pass. | `server/app.js`, `src/lib/provider-registry.js` | Existing provider parameter tests do not cover live Gemini 2.5/2.0 |
| C9 | Needs live test | Provider catalog pagination and warning-only catalog mismatch behavior are not implemented/verified in this pass. | `server/app.js`, `src/lib/provider-registry.js`, `src/ui/SearchableModelPicker.jsx` | No paginated catalog tests |
| C10 | Needs live test | Capacitor Flutterwave checkout/return deep link and payload-hash-bound idempotency remain unverified and incomplete. | `src/ui/App.jsx`, `capacitor.config.json`, `scripts/configure-android.mjs`, `server/app.js` | No Flutterwave sandbox/device test |
| C11 | Partial; needs live test | Service-worker cache stamping now replaces any cache version; registration is skipped in Capacitor. Update-prompt semantics and old `/_next/static` eviction still need live verification. | `scripts/stamp-service-worker.mjs`, `pages/index.jsx`, `tests/one-pass-regressions.test.mjs` | C11 source test; PWA update test needed |
| C12 | Needs live test | Backup restore transaction/row validation and skipping account/device-specific settings remain incomplete. | `src/lib/backup.js`, `src/ui/App.jsx` | Existing ZIP helper tests do not cover atomic Dexie restore |
| C13 | Partial; needs live test | Production CORS excludes plain `http://localhost`; Capacitor build fails without `NEXT_PUBLIC_API_BASE`; native service-worker registration is skipped. CI/Vercel double-deploy configuration and full method reflection remain incomplete. | `server/app.js`, `scripts/build-capacitor.mjs`, `pages/index.jsx` | C13 source test; CI/deploy/device test needed |
| D1 | Needs live test | `src/lib/biometric.js` still requires a full race/error/Capacitor-vs-browser audit. | `src/lib/biometric.js` | Existing biometric unit tests; physical device test needed |
| D2 | Needs live test | `src/lib/agents.js` still requires full stale-closure, key migration and cross-account audit. | `src/lib/agents.js`, `src/lib/cloud-sync.js` | Existing key-vault tests; account-switch tests needed |
| D3 | Needs live test | `src/lib/backup.js` ZIP helper has tests; restore transaction and hostile-row validation remain incomplete. | `src/lib/backup.js`, `src/ui/App.jsx` | Existing backup ZIP tests only |
| D4 | Needs live test | `src/lib/video-adapters/gemini.js` has not been verified against a live provider. | `src/lib/video-adapters/gemini.js` | Provider credential test needed |
| D5 | Needs live test | `src/ui/AgentsWorkspace.jsx` model testing and capability-filtering paths remain incomplete. | `src/ui/AgentsWorkspace.jsx`, `src/lib/provider-registry.js` | Existing provider tests only |
| D6 | Needs live test | `src/ui/FreeToolsWorkspace.jsx` requires route/error and role-isolation audit. | `src/ui/FreeToolsWorkspace.jsx`, `src/ui/App.jsx` | No route integration test |
| D7 | Needs live test | `src/ui/GrowthLabWorkspace.jsx` requires all button and image-count interaction audit. | `src/ui/GrowthLabWorkspace.jsx`, `src/ui/App.jsx` | No component interaction test |
| D8 | Needs live test | `src/ui/HistoryLibraryWorkspace.jsx` requires account-scoping and empty/error state audit. | `src/ui/HistoryLibraryWorkspace.jsx`, `src/lib/db.js` | Existing Dexie tests only |
| D9 | Needs live test | `src/ui/SearchableModelPicker.jsx` needs catalog pagination, keyboard and large-list performance testing. | `src/ui/SearchableModelPicker.jsx` | No browser performance test |
| D10 | Needs live test | `src/ui/styles.css` needs viewport/safe-area/keyboard/touch-target testing from 320px through tablet. | `src/ui/styles.css` | No visual/device test |
| D11 | Needs live test | `server/lib.js` credits/reservation logic requires concurrent Firestore transaction and replay tests. | `server/lib.js`, `server/app.js` | Existing pure credit tests; staging concurrency test needed |
| D12 | Needs live test | Flutterwave webhook handler requires signed live sandbox webhook and replay tests. | `server/app.js`, `tests/webhook-handler.test.mjs` | Tests could not load without dependencies; sandbox test needed |
| D13 | Needs live test | `src/lib/security-lock.js` and server lock routes need browser/native lockout, cancellation and account-switch tests. | `src/lib/security-lock.js`, `server/security-lock.js` | Existing isolated tests; physical device test needed |
| D14 | Needs live test | `server/media-jobs.js` needs concurrent job-state, retry, cancellation and ownership tests. | `server/media-jobs.js`, `server/app.js` | No live provider job test |
| D15 | Needs live test | `server/video-adapters.js` needs per-provider API contract and timeout/retry testing. | `server/video-adapters.js`, `server/video-adapters/` | Live provider credentials needed |
| D16 | Needs live test | `server/image-adapters.js` needs per-provider response, size and settlement tests. | `server/image-adapters.js` | Live provider credentials needed |
| D17 | Needs live test | `android-template/*.java` plugins need generated-project compile and physical Android tests. | `android-template/`, `scripts/configure-android.mjs` | Android SDK/device unavailable |
| D18 | Needs live test | `scripts/release-audit.mjs` remains a static guard, not a runtime certification; its assertions need alignment with current source and updated checks. | `scripts/release-audit.mjs`, `tests/` | Static audit ran before final edits; rerun with dependencies |
\n## Deployment freshness / stale-cache prevention\n- Service worker cache is build-stamped; HTML, API/auth and Next.js chunks are network-only. Activation removes legacy shell/static caches and stale cached HTML/chunks.\n- Browser/PWA checks for worker updates on focus and visibility return. Capacitor continues to skip service-worker registration.\n- Regression tests: `tests/service-worker-freshness.test.mjs`.\n
## 2026-11-01 — BYOK model and API-key fallback routing

| ID | Status | Files touched | Regression test |
|---|---|---|---|
| BYOK-FALLBACK-1 | Fixed in source; live provider test needed | `src/lib/agent-routing.js`, `src/ui/App.jsx`, `server/app.js` | `tests/agent-routing.test.mjs` — primary models across configured keys are attempted before model variants |
| BYOK-FALLBACK-2 | Fixed in source; deployed PWA/APK test needed | `src/ui/App.jsx`, `server/app.js` | `tests/agent-routing.test.mjs` — each fallback stays paired with its saved key, provider, endpoint, and task |
| BYOK-FALLBACK-3 | Fixed in source | `src/ui/App.jsx`, `tests/agent-routing.test.mjs` | API & Agents Test covers configured model variants and reports fallback model success |
| BYOK-FALLBACK-4 | Fixed in source | `server/app.js`, `tests/byok-only-policy.test.mjs` | server accepts only user-configured candidates; no platform AI keys are candidates |

## 2026-11-01 — Creator chat and auth lock update

| ID | Status | Files touched | Test |
|---|---|---|---|
| UI-CREATOR-CHAT | Fixed in source; needs visual/live verification | `src/ui/App.jsx`, `src/ui/WorkspaceSection.jsx`, `src/ui/styles.css` | `Creator chat hides stale configure-agent prompt when a compatible creator agent exists and groups history by date` |
| API-LOCK-METHOD | Fixed in source; needs device/browser verification | `src/lib/biometric.js`, `src/ui/AgentsWorkspace.jsx` | `API page lock uses a single platform authenticator without requiring PIN enrollment` |
| FIREBASE-AUTH-DOMAIN | Fixed in source; needs live OAuth verification | `src/lib/auth-domain.js`, `src/lib/firebase.js`, `tests/one-pass-regressions.test.mjs`, `docs/AUTH_FLOW.md`, `AUTH-ISOLATION-DEPLOYMENT.md` | `Firebase auth domain stays on the Firebase-provisioned domain by default` |

Security note: removing the PIN fallback means losing access to the configured device biometric/passkey can prevent unlocking the API page. Users should disable the lock from a trusted session before losing that authenticator.

| AI-API-SOURCE | Fixed (source); needs live test | Removed the separate Developer AI mode state and settings API; all Creator/Developer AI actions now require task-matched agent records from API & Agents, and the UI no longer offers a separate PotHub AI / my-agent choice. Server routing rejects missing configured candidates and does not fall back to platform keys. | `src/ui/App.jsx`, `server/app.js`, `tests/api-page-source-of-truth.test.mjs`, `tests/critical-regression-source.test.mjs`, `docs/PRICING.md`, `docs/AGENT_KEYS.md` | `api-page-source-of-truth.test.mjs` (3 tests), `critical-regression-source.test.mjs`, `agent-mode-policy.test.mjs` |

## 2026-11-08 — agent preflight and environment key rotation
- Strengthened the shared agent engineering protocol with a mandatory repository preflight: establish repo/branch/revision and scope, inspect callers/config/tests, explain the evidence-backed plan before writes, avoid unrequested commits/deploys, inspect the complete diff, and provide a verifiable delivery report.
- Added write-only Edit / rotate controls for existing Vercel environment variables. Secret values are never fetched or displayed; users re-enter a replacement value under the same variable name and Vercel upsert updates it.
- Added provider-key labels in the Vercel Variables page and documented the existing fixed `POTHUB_AI_*` pointer-variable contract, function mapping, strict backend/direct mode separation, and Vercel runtime limitations.

## 2026-11-08 — runtime provider registry and function-aware backend routing

- Added `server/runtime-agent-registry.js` to discover server-side provider credentials from conventional environment variable names and resolve task-specific models using the shared provider capability registry.
- Added authoritative `POTHUB_AI_AGENT_MAP` support for Chat, Diagnosis, Fix, Image and Video assignments. Explicit maps prevent unassigned functions from borrowing another function's credentials or model.
- Added authenticated, non-secret `/api/agent/runtime-env` metadata discovery for backend-mode UI selection.
- Wired `X-Pothub-Provider-Mode: backend` through the CORS allow-list and agent request path. Runtime environment candidates are included only in backend mode; direct mode remains limited to encrypted direct-agent configuration.
- Extended the Vercel Manage Variables page with function/model assignment controls and write-only secret rotation. The non-secret function map is stored as a Vercel environment variable and mirrored as metadata for UI display.
- Preserved the existing Vercel Backend custom endpoint agents; they remain eligible only in backend mode and retain priority over runtime-environment candidates.
- Added runtime registry tests for common providers, explicit task assignments, fixed legacy pointers, invalid configuration, media capability boundaries and secret-free metadata.
- Added project-scoped runtime authorization: saving `POTHUB_AI_AGENT_MAP` also pins `POTHUB_RUNTIME_PROJECT_ID`; only an authenticated user whose selected Vercel project matches can enumerate/use runtime provider metadata and credentials.
- Added high-confidence text intent routing for repo/code/log-backed diagnosis and repair prompts, while keeping ordinary how-to questions on Chat.
- Routed backend runtime Video keys server-side across submit, status, result, cancellation and resume flows; browser requests carry mode metadata, never the provider key.
- Added custom OpenAI-compatible and Azure OpenAI endpoint/model assignments with public HTTPS/DNS validation.
- Tightened engineering prompt idempotence while preserving the original prompt text and structured-output contract.
- Corrected Termux long-command script execution to preserve the selected HOME/workspace path by avoiding a login shell.
