# PotHub hardening update — 2026-11-03

## Implemented in this update

- Enforced exact task matching in fallback selection; unscoped and `all`-task candidates are rejected. Sibling task agents are not used as fallback candidates.
- Preserved task and workspace scope in candidate objects and required an explicit workspace value matching the request's workspace header on server routes.
- Added `workspace` to saved agent records. Existing unscoped records migrate to `developer` without decrypting, replacing, duplicating or deleting their keys.
- Filtered Creator and Developer agent inventories independently in the UI, and added a Creator API & Agents entry point so Creator can configure its own agents.
- Preserved a Creator image/video prompt when its required agent is missing, and attempt a resume after saving a Creator agent.
- Normalized legacy `gemini-3.8-flash` to the configured active-family candidate `gemini-3.6-flash`; removed `gemini-3.8-flash` from the offered model list.
- Expanded both chat composers to grow up to `min(40dvh, 240px)` and scroll internally beyond that limit; retained autocorrect, sentence capitalization and spellcheck.
- Sanitized common provider auth/quota/rate-limit/safety/transient failures into actionable user messages, while retaining request IDs for diagnostics.
- Updated tests that encoded retired pricing/model and cross-task fallback behavior.

## Verification performed

- `node --check server/app.js`, `src/lib/agent-routing.js`, and `src/lib/agents.js`: passed.
- TypeScript JSX parse for `src/ui/App.jsx`, `src/ui/AgentsWorkspace.jsx`, `src/ui/WorkspaceSection.jsx`: passed.
- BYOK repository audit, pricing margin check, and release audit: passed.
- Focused routing/planner/pricing tests: 27/27 passed.
- Full suite: 221 tests discovered, 205 passed, 16 failed because required dependencies could not load in this environment. The full suite is not green.
- Production Next.js and Capacitor builds were not verified. The PDF.js worker is missing in this environment.

## Critical limitations — not a production certification

- Agent keys still exist in the local encrypted store and are transiently sent with authenticated requests; this update does not finish server-only key custody.
- Workspace scope is carried and checked, but a client can forge the scope label because server-owned agent records and credential fingerprints are not yet implemented. Do not treat this as a complete authorization boundary.
- The dependency-aware mixed-capability planner is not yet the single execution path for all endpoints. Fully durable multi-step jobs, automatic resume for all mixed requests, and a complete all-format output-delivery layer remain unfinished.
- Actual image/video generation was not validated with user-owned provider keys.

Deploy only to a preview until dependencies install successfully, the complete test suite is green, the production web build succeeds, and the Capacitor build is verified.
