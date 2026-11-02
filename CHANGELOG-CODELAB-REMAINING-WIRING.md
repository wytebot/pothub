# PotHub Codelab — Remaining Wiring Pass

## Files changed
- `src/ui/codelab/diff-hunks.js` — bounded line-diff generation and safe selective hunk application with stale-source protection.
- `src/ui/codelab/components/HunkReview.jsx` — accessible modal with per-hunk Accept/Reject, reset, cancel and explicit Apply accepted hunks controls.
- `src/ui/codelab/pages/Project.jsx` — added Review hunks control for the selected text file and wired accepted changes into existing undo/history-aware `applyFiles` state.
- `src/ui/codelab/codelab.css` — responsive hunk-review modal styling, safe-area insets and 44px control targets.
- `server/app.js` — added `/api/github/agent/commit-approved`: requires explicit approval, validates file paths and sizes, checks the reviewed base SHA has not changed, creates a new branch and commit, and never writes to the default branch.
- `src/ui/codelab/github.js` — added `approvedAgentCommit` API client helper.
- `tests/diff-hunks.test.mjs` — tests identical files, selective hunk acceptance, stale-source rejection and bounded large-file fallback.

## Verification performed
- `node --check server/app.js`: passed.
- `node --check src/ui/codelab/diff-hunks.js`: passed.
- `node --test tests/diff-hunks.test.mjs tests/ai-workflow-credit-policy.test.mjs tests/credit-reservations.test.mjs`: 11 passed.
- `node scripts/release-audit.mjs`: passed (static source audit only).
- `tests/webhook-handler.test.mjs` could not load because `express` is not installed in this environment.
- ZIP integrity checked after packaging.

## Important scope note
This pass adds a working hunk-by-hunk review UI for the selected file's local diff and a guarded approved multi-file branch-commit API. It does **not** claim to finish all previously requested work: autonomous AI plan generation and end-to-end review-to-commit UI, live PR lifecycle, complete streaming/cancellation behavior, all Firestore/Flutterwave edge cases, Creator history/queue polish, dependency installation, production build, or real-browser/device tests remain unverified/incomplete. No deployment or live payment test was performed. The shared credit rule is one credit per successful agent action; image/video/file output counts are metered per generated output.
