# Repository Chat Workflow Update

## Implemented in this pass
- The `Fix it in chat` action opens the repository-edit chat, highlights the diagnosed file paths, includes the diagnosis and recent logs, and automatically submits a repair request to the configured developer chat agent.
- Repository-edit messages are saved in the existing Dexie/IndexedDB `chats` and `messages` tables, keyed by a repository-specific chat ID, and queued for the existing signed-in account cloud sync.
- Generated code blocks retain editable, resizable textareas without a fixed character limit. Height adapts to content; the editor remains scrollable for long files.
- Individual code blocks retain `Commit this file`; when multiple code blocks exist, a `Commit all N files` action commits them together to a review branch. Neither action silently commits to the default branch.
- The affected-file hint row uses subtle fade-in animation. Existing response progress animation remains in place.

## Validation
- TypeScript transpile parsing for `src/ui/WorkspaceSection.jsx` and `src/ui/App.jsx`: passed.
- `node scripts/release-audit.mjs`: passed (static audit only).
- Selected regression tests: 12/12 passed.
- Full production build and live GitHub/OAuth/cloud-sync flows were not run in this environment; do not treat this as live integration certification.
