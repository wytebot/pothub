# PotHub technical execution-flow update — 2026-11-08

## Reference review

Reviewed the supplied 16-second screen recording. The useful pattern is a visible, ordered execution trace that begins before the answer arrives, names concrete operations, advances as work progresses, and ends with a clear delivery/verification report. This implementation uses PotHub terminology and a compact technical checklist rather than copying the reference UI or wording.

## Behaviour added

- Technical/repository/debugging/integration/deployment prompts receive an explicit preflight brief in the shared engineering protocol.
- The brief covers scope, target context, evidence to inspect, ordered phases, compatibility constraints, validation, assumptions and risks.
- Agents are instructed to distinguish planned, active, completed and blocked work, and never fabricate tool activity or test results.
- Technical Creator chat now displays an execution sequence in the pending assistant message before the first streamed response token.
- The timeline advances at concrete client workflow boundaries: request classification, agent/provider resolution, context preparation, payload validation, dispatch, and response finalization.
- Simple non-technical chat is not cluttered with the timeline.
- Failed stages are marked as interrupted rather than incorrectly shown as complete.
- The final assistant message retains a completed execution timeline for review.

## Files changed in this pass

1. `server/engineering-protocol.js` — added `TECHNICAL_EXECUTION_BRIEF` and included it in technical modes.
2. `src/ui/App.jsx` — constructs and advances the request execution timeline in Creator chat.
3. `src/ui/WorkspaceSection.jsx` — renders the timeline above streamed response content.
4. `src/ui/styles.css` — adds responsive, reduced-motion-aware timeline styling.
5. `tests/engineering-protocol.test.mjs` — tests the preflight protocol requirements.
6. `tests/chat-area-ui.test.mjs` — tests the visible execution timeline wiring.
7. `TECHNICAL-EXECUTION-FLOW-UPDATE.md` — this implementation note.

## Verification

- Targeted tests: 25 passed, 0 failed (`engineering-protocol`, `chat-area-ui`, `vercel-project-env-manager`).
- Release static audit: passed.
- Full suite: 455 passed, 18 failed out of 473. The 18 failures are environment/dependency load failures in this workspace (including missing `express`, `firebase-admin`, `@hapi/iron`, `jszip`, and `typescript`), not a clean full-suite pass.
- JSX compilation and production build were not run because project dependencies are not installed in this workspace.
- No live provider request or production Vercel deployment was performed.

## Known boundary

The timeline reports real application workflow boundaries. It does not expose private model chain-of-thought, and it does not claim that the model has read or edited repository files unless the connected repository/Termux tools actually performed those operations. For code tasks, the agent's textual preflight brief is separate from tool-backed execution progress.
