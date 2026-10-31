# PotHub Phase 0 Audit & Implementation Report

Date: 2026-10-30  
Input: `pothub-server-errors-fixed.zip`  
Scope: source/config/docs/tests present in the supplied archive. This is a static source audit; live credentials, deployed Vercel state and physical devices were not available.

## Baseline before edits

The original archive was extracted separately and tested before modifications:

| Command | Baseline |
|---|---|
| `npm test` | PASS — 57 tests, 57 passed |
| `npm run check` | PASS — source release audit + 57/57 tests |
| `npm run pricing:check` | PASS — existing prices/credits satisfy the built-in conservative estimate (output included an `undefined` file-operation value) |
| `npm run build` | BLOCKED — dependencies absent; `prepare-next-assets.mjs` cannot find `node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs` |
| `npm run build:cap` | BLOCKED — same missing PDF.js worker/dependency installation |

`npm install --ignore-scripts --no-audit --no-fund` and `npm install --package-lock-only ...` were attempted, but the package registry did not complete within the available execution window. The archive contains no `package-lock.json` and the runtime has no populated `node_modules`.

## Findings and remediation status

Severity: CRASH, MONEY, SECURITY, UX, PERF. Line numbers below refer to the updated source tree; nearby lines can move as the project evolves.

| File / lines | Severity | Root cause / finding | Fix plan | Status in this update |
|---|---|---|---|---|
| `scripts/prepare-next-assets.mjs:8-11` | CRASH | Build requires the PDF.js worker to exist in installed dependencies. | Install dependencies from a pinned lockfile, then build web and Capacitor. | Not resolved: registry install unavailable; build remains blocked. |
| `package.json` | PERF / CRASH | Dependency ranges exist but no lockfile was supplied. | Generate and commit a reproducible lockfile in a network-enabled environment. | Not resolved; no reliable lockfile can be fabricated. |
| `server/app.js:3` | CRASH / PERF | JSON body limit was 25 MB, above the typical serverless request envelope. | Bound request body to 4 MB and keep large media out of request bodies where possible. | Implemented: 4 MB Express JSON limit. |
| `server/app.js:31` | SECURITY | Custom provider endpoint validation is the critical SSRF boundary; custom endpoint opt-in must remain enforced. | Preserve HTTPS/public-host checks and custom endpoint environment gate across all new provider routes. | Preserved and reused by text/model-discovery routes; DNS rebinding resolution checks remain a hardening item. |
| `server/app.js:32-95` | SECURITY / UX | Existing AI routing supported Gemini and two generic protocols; failures and prompt context handling were inconsistent. | Shared provider catalogue, log preprocessing, key redaction, robust parsing and bounded fallback. | Partially implemented: compatible text/vision provider routing, prompt/log safety and secret scrubbing. Persistent health scoring/circuit breaker and normalized error taxonomy remain outstanding. |
| `server/app.js:97` | MONEY | AI operation charging was non-idempotent at the route level. | Use a stable operation ID and idempotent spend marker; refund failed operations. | Implemented for Diagnosis/Fix and generic charged model operations; client supplies operation IDs for Diagnosis/Fix. A formal reserve→commit→release state machine remains outstanding. |
| `server/lib.js:149-173` | MONEY | Ledger entries lacked explicit before-balance and operation metadata in some paths. | Append-only ledger with before/after balance, reason and operation reference in the same Firestore transaction. | Implemented for spend, idempotent spend and grant transactions. A dedicated ledger viewer and reconciliation script remain outstanding. |
| `server/app.js:99-110` | SECURITY / UX | Agent configuration had no model discovery and task test was a generic text ping. | Add capability-aware provider metadata, live model list where protocol supports it, and manual model entry. | Partially implemented: registry + model discovery for Gemini, Anthropic-compatible and OpenAI-compatible. Media provider adapters beyond Gemini are catalogue-only. Task-specific media capability verification remains outstanding. |
| `src/lib/provider-registry.js` | UX / SECURITY | Provider metadata was scattered and provider choices were limited. | Central declarative registry with protocol/auth/base URL/models/capabilities and implementation status. | Implemented for provider catalogue and text/vision compatible protocols. Image/video declarations are explicitly marked `implemented:false` until adapters exist. |
| `src/ui/App.jsx:114` | PERF | The main React shell is a large single module with heavy static imports. | Profile and split into lazy-loaded workspace/feature chunks. | Not implemented; splitting without a real browser build would carry unacceptable regression risk. |
| `src/ui/App.jsx:141-142` | UX / MONEY | No friendly platform-AI rescue path and no operation idempotency key in Diagnosis/Fix client calls. | Add recovery sheet, BYO quick-add handoff, retry, rescue fee waiver and operation IDs. | Partially implemented for Diagnosis/Fix. Existing agents are sent as ordered candidates; persistent health scoring/toasts and rescue handling for Chat/Image/Video remain outstanding. |
| `src/ui/App.jsx:168-178` | UX | No first-class local prompt library / build health discovery. | Add local-first feature surfaces with no provider calls or ledger writes. | Implemented: Creator Prompt Library and Developer Build Health/Error Library; local Dexie records and backup support. |
| `src/lib/biometric.js:1-60` | SECURITY | Browser WebAuthn assertion is not verified by a server relying party; no secure PIN fallback. | Server-issued challenge, server-side assertion verification, PIN fallback and local rate limiting. | Not implemented. Existing native biometric remains optional and scoped to Agents; do not treat browser lock as high-assurance. |
| `src/ui/App.jsx:2-29` | PERF | Highlight.js and language grammars are eagerly imported. | Lazy-load code highlighting, PDF.js, Gemini SDK and ZIP codec. | PDF.js is already dynamically imported; other lazy-loading/profile work remains outstanding. |
| `src/ui/App.jsx:177-178` | UX | File input uses the platform file chooser; a fully themed browser picker cannot replace the OS chooser. | Keep a styled trigger, ensure focus/keyboard behavior, test native picker return. | Existing styled trigger retained; comprehensive picker regression/device testing remains outstanding. |
| `server/app.js:241-242` | MONEY / UX | AI output shape is manually normalized after generation; strict output schemas and one repair retry are absent. | Add per-task Zod output schemas, one validation repair attempt, then next provider fallback. | Not implemented; parser hardening is in place, but strict server response validation/repair remains a release blocker for the requested quality target. |
| `server/app.js:303+` | MONEY | Video delivery charge is idempotent and after result retrieval, but stream interruption after headers is difficult to refund reliably. | Persist delivery state and reconcile stream completion before final charge. | Not changed to avoid regressing existing idempotent video charging. Requires a dedicated persisted job state machine. |
| `server/app.js:312` | CRASH / SECURITY | Express has an existing final JSON error middleware; async route coverage is not uniformly wrapped. | Audit each route, wrap all async handlers, add bounded timeouts and outage responses. | Existing final handler preserved; global browser rejection/error handlers added. Full async-route wrapping and dependency fault injection remain outstanding. |
| `server/app.js` health route | SECURITY | Dependency reporting needs deployment verification for sanitized detail and actual readiness. | Exercise each dependency failure and inspect public health output. | Not live-tested; requires Firebase/Vercel environment. |
| `public/sw.js` | PERF / UX | Static shell/update logic is sensitive to cache changes. | Preserve no-API/auth-cache behavior and run offline/update regression tests. | Not modified; existing tests remain green. |
| `server/pricing.js`, `scripts/pricing-check.mjs` | MONEY | Existing model uses generalized per-credit estimate and a single worst-channel fee. | Add editable per-provider token/media inputs, separate channel calculations and sensitivity without changing prices. | Implemented as planning model; vendor rates are illustrative and need invoice reconciliation. |
| `docs/AGENT_KEYS.md`, `docs/PRICING.md`, `docs/COMPATIBILITY.md`, `docs/DEVICE_TEST.md` | UX / SECURITY | Docs did not describe the broader provider catalogue, new workflows or verification gaps. | Update docs and environment-variable list. | Updated. |

## Security and regression invariants preserved

- GitHub OAuth, Vercel OAuth, native ticket exchange and Google/Firebase redirect code were not rewritten.
- Flutterwave checkout/authorize/verify/webhook code was not rewritten.
- Backup format remains schema version 2; `agents` and `settings` are excluded; new local `promptLibrary` table is optional in old backups.
- Existing Gemini image/video adapters remain the only executable media adapters.
- Existing service worker was not replaced.
- Custom HTTPS endpoints remain gated by `POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS=true` and local/private URL checks.

## Post-change automated verification

| Command | Result |
|---|---|
| `node --check server/app.js` | PASS |
| `node --check server/lib.js` | PASS |
| `npm run check` | PASS — static release audit + 68/68 tests |
| `npm test` | PASS — 68/68 tests |
| `npm run pricing:check` | PASS — reports web/Play channels and sensitivity |
| `npm run build` | BLOCKED — dependencies/PDF.js worker unavailable |
| `npm run build:cap` | BLOCKED — dependencies/PDF.js worker unavailable |

## Release blockers / remaining work

1. Install dependencies and generate/commit `package-lock.json` on a network-enabled machine; rerun web and Capacitor builds.
2. Complete production adapters for Stability, Replicate, fal, Black Forest Labs, Runway, Luma and Kling; do not expose catalogue-only providers as usable options.
3. Add per-provider persistent health scoring/circuit breaker and strict Zod response validation with one repair retry.
4. Complete transaction-backed reserve/commit/release semantics and an admin-safe ledger reconciliation script.
5. Complete server-verified WebAuthn and a safe PIN fallback; test native biometric on Android.
6. Profile and split the React shell; test low-end Android and all supported viewport/browser targets.
7. Run live Firebase/OAuth, GitHub Actions, Flutterwave sandbox/webhook, AI provider and physical APK test matrices.

## Post-audit integration pass — 2026-10-30

The original Phase 0 findings above are retained as a baseline snapshot. The following remediation has now been added in source:

| Area | Files | Result | Remaining verification |
|---|---|---|---|
| Runway video | `server/video-adapters.js`, `server/app.js`, `src/lib/provider-registry.js` | Text-to-video task creation, task polling, output retrieval and cancellation request adapter using the pinned Runway API version. | Requires a valid Runway API key and an actual account/model test. |
| Luma video | Same | Dream Machine video generation endpoint, status polling, output download and cancellation attempt. | Requires Luma API key and account-level test. |
| Kling video | Same | Current Kling API-key bearer auth, Kling 3.0/4.0 text-to-video task creation, task query and output retrieval. | Cancellation is local-only because a supported cancel endpoint was not confirmed; test actual account response. |
| Replicate video | Same | Resolves latest model version (or accepts explicit `owner/model:version`), creates async prediction, polls and downloads output. | Requires a real model/version and Replicate account test. |
| Durable media jobs | `server/media-jobs.js`, `server/app.js`, `docs/DEVICE_TEST.md` | Firestore owner-bound job records, stable operation-ID deduplication, opaque Pothub IDs, resumable client polling and TTL timestamps. Provider keys are not stored. | Enable Firestore TTL and test with real Firestore. No server worker can poll BYOK jobs while the client is offline because keys are deliberately never persisted. |
| Cross-instance provider health | `server/provider-health.js`, `server/app.js` | Firestore transaction-backed breaker state plus a warm-instance cache; used by text/JSON and video submit/poll paths. | Requires Firestore and concurrent Vercel instance verification. |
| Workspace splitting | `src/ui/App.jsx`, `src/ui/WorkspaceSection.jsx`, `src/ui/AgentsWorkspace.jsx`, `src/ui/HistoryLibraryWorkspace.jsx` | Developer/Creator workspace, Agents, and History/Library are lazy route chunks. PDF.js, syntax highlighting and backup ZIP parsing remain deferred. | Confirm actual bundle output after dependency install and profile on low-end Android. |
| History virtualization | `src/ui/VirtualHistoryList.jsx`, `src/ui/HistoryLibraryWorkspace.jsx` | Windowed visible rows; initial local history fetch capped at 1,000 entries. | Test with large real IndexedDB histories on physical devices. |
| Model picker | `src/ui/SearchableModelPicker.jsx`, `src/ui/AgentsWorkspace.jsx`, `server/app.js` | Searchable combobox, keyboard controls, manual model IDs, capability-specific model suggestions and live discovery where supported. | Live model discovery depends on provider API access; video provider IDs remain manually selectable. |
| Browser security lock | `server/security-lock.js`, `src/lib/biometric.js`, `server/app.js` | One-time Firestore WebAuthn challenges, server-side registration/assertion verification, credential counter storage, scrypt PIN fallback and attempt lockout. | Requires installed `@simplewebauthn/server`, correct `APP_ORIGIN`, HTTPS and live authenticator tests. |

### Remaining release blockers

- Production dependency installation and package-lock generation did not complete because npm registry access timed out in this environment.
- Both production and Capacitor builds stop before compilation because the installed PDF.js worker is absent (`node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`).
- No production Firebase, Flutterwave, GitHub OAuth, Google OAuth or Vercel OAuth credentials were supplied, so no live transaction/redirect test was possible.
- No Android SDK/ADB-connected physical device was available; APK installation, native biometric prompt, MediaStore, deep-link and real device behavior remain unverified.
- Provider adapters are source-wired and API shapes were checked against vendor documentation, but no provider keys were available for real generations or billing verification.


## 31 October 2026 persistence/biometric fact-check supersession

The earlier observations above are the initial audit baseline. The follow-up now includes server-verified browser WebAuthn registration/assertion and server-side PIN fallback (see `server/security-lock.js`), plus native biometric/PIN fallback hardening and secure-storage-backed lock state (see `src/lib/biometric.js`). Account switching no longer clears outgoing local records; Dexie v5 partitions and restores per-account caches (see `src/lib/account-cache.js`). Native agent-key migration now preflights all records before committing a single transaction (see `src/lib/agents.js`). See `FACT-CHECK-PERSISTENCE-BIOMETRIC.md` for current test outcomes and remaining live-device checks.
