# PotHub Codelab — agent workflow wiring (2026-11-02)

## Files changed in this pass
- `server/app.js` — added authenticated `/api/github/agent/plan`: captures the exact base branch SHA, inspects a bounded set of redacted repository files, uses the configured BYOK agent path and existing credit workflow, validates proposed paths/JSON/source syntax, and returns a review-only multi-file change set. It does not commit automatically.
- `src/ui/codelab/github.js` — added the plan endpoint client helper.
- `src/ui/codelab/components/AgentPlanPanel.jsx` — added a visible goal → plan → per-file review → explicit approval → new branch commit → optional PR workflow. The user can deselect proposed files and inspect the full proposed content before approving.
- `src/ui/codelab/pages/Project.jsx` — added the Agent entry point and connected the agent panel to the selected repository and branch.
- `src/ui/codelab/codelab.css` — added responsive, safe-area-aware styles for the agent review panel and touch targets.

## Safety behavior
- Plan generation is not a commit. The user must explicitly approve the selected file set.
- Commit uses the pre-review base SHA and rejects stale base branches; approved changes go to a new branch, not the default branch.
- Potentially secret-bearing paths are blocked; repository context is redacted and excludes `.env`, credentials, generated directories and binary/oversized files.
- JSON and JavaScript/TypeScript source outputs are validated before being offered for review.
- PR creation is optional and only available after the branch commit succeeds.
- AI requests use the existing configured-agent routing and credit reservation/settlement path; no hardcoded provider model was introduced.

## Verification performed
- `node --check server/app.js` passed.
- TypeScript compiler JSX transpile/syntax check passed for `AgentPlanPanel.jsx`, `Project.jsx`, and `HunkReview.jsx`.
- `node --check server/agent-mode-policy.js` passed.
- `npm install --no-audit --no-fund` timed out before dependencies were installed. Consequently, `npm run build`, `npm run check`, integration tests, live provider calls, GitHub mutation calls, browser tests and Capacitor device tests were not run.

## Still not certified complete
This pass connects the autonomous plan/review/commit/optional-PR lifecycle, but does not claim that all prior requirements are complete. True token-by-token provider streaming and cancellation, exhaustive Firestore/Flutterwave webhook replay and transaction tests, Creator prompt/history/library end-to-end verification, and real Chrome/Safari/Android/APK testing remain unverified. No deployment was performed.
