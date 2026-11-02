# PotHub Codelab one-pass workspace update — 2026-11-02

## Files changed

- `src/ui/codelab/pages/Project.jsx`
  - Added persistent open-file tabs (up to 12), tab close/switch controls, fuzzy Go to File, `Ctrl/Cmd+P`, repository search and replace, `Ctrl/Cmd+Shift+F`, symbol outline, desktop split editor, and selection-aware Explain/Fix/Refactor/Tests/Comments actions that route context to PotHub Chat and request explicit approval instead of silently applying edits.
  - Search skips obvious binary formats, `.env` files, and files larger than 300 KB; the repository scan is bounded to 120 text files and 400 matches.
  - Removed Pro-plan UI gates for PR, revert and repository deletion; labels now state the one-credit mutation cost. Removed old Pro-specific local history limits and plan-based preview labels.
- `src/ui/codelab/codelab.css`
  - Added responsive styles for file tabs, search panels, symbol outline, and split editor with reduced dependence on browser-default controls.
- `src/ui/App.jsx`
  - Extended the repository AI entry point to accept a file/branch/selection/action prompt context.
- `server/app.js`
  - Removed the legacy Pro plan fields from Codelab session/preview responses and removed credit charging from bulk file deletion. PR creation, repository deletion, and revert remain charged through their existing server-side one-credit mutation middleware.
- `server/wytelab-github.js`
  - Removed legacy Pro gates for PR/revert-related operations and updated user-facing WyteLab error copy to PotHub Codelab.
- `tests/codelab-workspace-enhancements.test.mjs`
  - Added regression checks for workspace UI affordances, contextual AI actions, mutation credit policy and removal of Pro gates.

## Credit policy preserved

AI jobs retain the shared per-successful-agent-action meter: one credit is charged per successful agent action. Each generated image, delivered video, and generated file consumes one credit per output. Failed jobs release reservations and do not advance the count. The same meter applies to text, image and delivered-video workflows.

## Verification performed

- `node --check server/app.js`: passed.
- `node --check server/lib.js`: passed.
- `node --check server/wytelab-github.js`: passed.
- TypeScript transpile parser syntax check for `src/ui/codelab/pages/Project.jsx` and `src/ui/App.jsx`: passed.
- `node scripts/release-audit.mjs`: passed (static source audit only).
- Focused tests: 10 passed, 0 failed.
- Full `node --test tests/*.test.mjs`: 168 passed, 24 failed to load due missing dependencies (`express`, `firebase-admin`, `typescript` package dependency resolution). `npm install --ignore-scripts --no-audit --no-fund` timed out.
- ZIP integrity: checked after archive creation.

## Not claimed complete

This is not a claim that every item in the larger Cursor-class specification is finished. Inline AI currently opens a contextual chat request; it does not yet provide a fully integrated per-hunk accept/reject patch UI. The full multi-file autonomous agent approval/branch/PR lifecycle, reliable streaming and cancellation, complete Firestore-transaction billing migration with exhaustive mocked webhook cases, Creator generation queue/history completion, conflict-safe cherry-pick/stash/merge workflows, and browser/device/APK runtime tests remain unverified or incomplete. Do not treat this ZIP as production-certified until dependencies install cleanly, build/check pass, and the missing workflows are completed and tested.
