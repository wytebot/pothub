# Changelog

## 2026-10-30 — audit-driven hardening update

- Added a shared provider catalogue for Gemini, major OpenAI-compatible text/vision services, Anthropic-compatible services, and explicit catalogue-only media providers.
- Added best-effort live model discovery for Gemini, Anthropic-compatible and OpenAI-compatible endpoints, retaining manual model IDs.
- Normalized provider routing for text/vision-compatible agents and retained custom HTTPS SSRF opt-in checks.
- Added log ANSI/noise removal, repeated-line de-duplication, error-context-aware prompt trimming, tolerant fenced/trailing/truncated JSON parsing and key scrubbing.
- Added operation IDs to diagnosis/fix requests, idempotent credit spending and before/after balance fields in credit ledger entries.
- Added a platform-AI recovery sheet for diagnosis/fix failures; adding a BYO agent retries the interrupted operation and waives the BYO service fee for that rescue.
- Added Verified Fix: watches for a new GitHub Actions run on the committed branch and charges 3 credits only after the server independently confirms that matching run completed.
- Added local Developer Build Health/Error Library and Creator Prompt Library; prompt records are included in backups while agents/keys remain excluded.
- Expanded pricing analysis and provider usage sensitivity without changing public prices or credit costs.
- Updated agent, pricing, compatibility and device-test documentation.
- Added regression tests for provider registry, prompt/log safety, JSON parser hardening, capability filtering, Verified Fix and local-library backup behavior (68 tests total).

## Known incomplete items

- Production image/video adapters beyond the existing Gemini implementation are catalogue-only, not wired to generation APIs.
- Persistent provider health scoring/circuit breakers, server-side response-schema repair retry, strict output schemas for all tasks, full route-by-route async wrapping, React route splitting, comprehensive request deduplication/compression, browser PIN fallback and server-verified WebAuthn challenge validation remain outstanding.
- Full physical-device/browser/provider/payment verification was not possible in this environment.

## Additional integration pass — 2026-10-30

- Added Firestore-backed credit reservation states (`reserved`, `committed`, `released`) with deterministic operation IDs and append-only before/after ledger entries.
- Diagnosis, Fix and Chat outputs now use strict Zod schemas with one structured repair retry; invalid output releases the reservation.
- Empty/unsafe Fix results release the original reservation rather than issuing a random grant.
- Image generation now uses an idempotent reservation and settles only after the response finishes; interrupted responses release the fee.
- Video delivery now uses the same reserve/commit/release response lifecycle and an 80 MB bounded delivery ceiling.
- Added process-local provider circuit breaker (two consecutive failures, 60-second cooldown) and success recovery.
- Added async Express route rejection forwarding to the final JSON error handler.
- Sanitized Firebase health diagnostics and added API & Agents idle relock plus re-authentication before key test/edit/delete.
- Added fallback-sheet keyboard focus trapping and documented remaining provider/device verification gaps.
- Added a branch-scoped Verified Fix revert: it verifies the branch still points at the exact Pothub-created commit, then writes a revert commit only to that repair branch; it never mutates the repository default branch.
- Added optional local PBKDF2 passcode fallback for API & Agents when platform biometrics/WebAuthn are unavailable, five-attempt cooldown, and two-minute idle relock. Lock remains scoped to API & Agents.
- Added an admin-only stale credit-reservation reconciliation script (dry-run by default; explicit `--release --confirm` required) and its Firestore composite index.
- Reduced the maximum buffered video result to 80 MB to reduce serverless memory pressure.

## 2026-10-30 — Remaining adapter and performance wiring pass

- Added provider-specific image adapters for OpenAI Images, Stability AI, Black Forest Labs, Replicate and fal.ai alongside Gemini.
- Added bounded queue polling and HTTPS result-host validation for asynchronous image providers; image output MIME type and size are validated before delivery.
- Expanded Image agent provider selection while keeping Video restricted to the currently wired Gemini job lifecycle.
- Added lazy-loaded syntax highlighting so highlight.js and language grammars are not part of the initial App shell chunk.
- Added adapter normalization tests and expanded provider capability regression coverage.
- No public credit prices or pack values changed.

## 2026-10-30 — Durable media, provider health, searchable models and server-verified lock

- Added provider adapters for Runway text-to-video, Luma Dream Machine, Kling 3.x/4.x task APIs and Replicate asynchronous predictions, alongside Gemini.
- Added Firestore-backed owner-bound media job persistence. Only provider/model/task metadata is persisted; BYOK keys remain transient and are re-supplied for status, cancellation and result retrieval.
- Added result URL safety checks, bounded redirects, video size caps and response-finish credit settlement.
- Added cross-instance Firestore provider-health persistence with transactional circuit-breaker updates.
- Added searchable keyboard-accessible model picker with manual IDs and capability-specific Replicate suggestions.
- Split Developer/Creator workspace, Agents and History/Library into lazy route chunks; history lists are virtualized and backup ZIP parsing is deferred.
- Added virtualized local history, lazy picker/history chunks and deferred backup ZIP parsing.
- Added server-verified WebAuthn registration/assertion challenges and server-hashed, rate-limited browser PIN fallback using `@simplewebauthn/server`.
- Added regression tests for adapters, durable job ownership, safe asset URLs, WebAuthn/PIN verification and virtualization.
- Live provider credentials, Firebase production configuration, payment/OAuth sandbox tests and physical Android tests remain deployment/device verification tasks.

## 2026-10-31 — Focused fact check
- Re-ran release audit and the complete automated test suite: 93/93 passed.
- Re-ran pricing validation; checked all JavaScript/MJS syntax and JSON/XML parsing.
- Added `QUICK_FACT_CHECK.md` and updated the verification report with the production-build dependency limitation and untested live integrations.
