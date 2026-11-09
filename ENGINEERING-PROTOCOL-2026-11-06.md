# Engineering protocol for all agents (2026-11-06)

## What changed
- New `server/engineering-protocol.js`: three shared rule sets (honesty, deep diagnosis, change safety) and
  `withEngineeringProtocol(prompt, mode, {structured})`, which appends them to a prompt.
- Wired at every AI call site in `server/app.js`, by wrapping the prompt at the call (no existing prompt text,
  schema, billing, reservation or validation code was edited):

  | Call site | Mode |
  |---|---|
  | `/api/diagnose` | diagnose |
  | `/api/repair/propose` | patch |
  | `/api/github/agent/plan` (Codelab plan) | edit |
  | `/api/codelab/agent/loop` planner and reasoning stage | readonly |
  | Developer "PotHub Edit" chat | edit |
  | Creator chat (JSON) and Creator chat stream | chat |

- `server/response-styles.js`: the chat "debug" style keeps its original sentence and gains extra guidance.
- `tests/engineering-protocol.test.mjs`: 9 tests (module behavior + source-contract checks on the wiring).

## Behavior the agents are now told to follow
- Label claims CONFIRMED / LIKELY / UNKNOWN; say "I don't know" and name the cheapest check; never claim to have
  run or tested anything without a tool result; never invent paths, versions or APIs.
- Diagnose from the FIRST failure, compare competing hypotheses, separate root cause from symptom, state confidence.
- Change as little as possible, list callers before touching an exported name, keep public behavior, never delete
  working code or weaken security/billing checks to silence an error, and report what could regress.
- For JSON-returning agents the rules apply inside the existing fields; the output shape is unchanged.

## Not verified here (honest limits)
- 27 tests fail both before and after this change, all from packages missing in the sandbox (express,
  firebase-admin, @hapi/iron, typescript, jszip). The failing set is identical, but those suites also cover
  `server/app.js`, so the wired handlers were checked by `node --check` and source-pattern tests, not executed.
- Prompt text is now longer, which adds input tokens per call. Not measured.
- `chargedModelJson` hashes the prompt for idempotency; a retry of an operation started before this deploy,
  with the same operationId, could be treated as a different payload. Not tested.
- Prompts can only ask a model to behave this way. They do not guarantee it. Run `npm install && npm run check &&
  npm run build` and a real diagnose/repair/chat request before release.

## Free-forever accounts (added later the same day)
- `server/free-forever-policy.js` + a check in the five charge functions of `server/lib.js`
  (`reserveCredits`, `commitCreditReservation`, `releaseCreditReservation`, `spendCredits`, `spendCreditsOnce`).
- Nothing is hard-coded; accounts are set with `POTHUB_FREE_FOREVER_EMAILS`, `POTHUB_FREE_FOREVER_GITHUB_LOGINS` and `POTHUB_FREE_FOREVER_GITHUB_IDS`.
- Not verified here: nothing touching Firestore could be run in this sandbox (no firebase-admin). The policy logic is
  unit-tested; the lib.js wiring is syntax-checked and source-checked only.
