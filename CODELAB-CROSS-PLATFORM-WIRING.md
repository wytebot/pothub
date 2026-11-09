# Codelab cross-platform wiring

## Implemented in this update
- GitHub remains the repository source of truth. Repository trees and text files are fetched from the GitHub API at use time and API responses are non-cacheable.
- Codelab has an inline editor with an explicit edit toggle, file staging, commit message, and review-branch commits. The server chunks large text changes into bounded Git commits rather than sending one oversized commit.
- ZIP export creates a standard stored ZIP in the client and saves through PotHub's platform-aware `saveBlob` helper (browser download or Capacitor Android public-download flow).
- ZIP/text upload works through the browser/Capacitor file input. ZIP import supports standard stored and Deflate entries when the runtime supports `DecompressionStream('deflate-raw')`, with path validation, text-only guard, and limits.
- Pull request creation and review-branch revert controls are wired to existing GitHub endpoints and the existing one-credit mutation wrapper.
- Bulk file deletion creates a new review branch and refuses to leave fewer than two repository files. The default branch is not changed by this action.
- Responsive file tree/editor layouts are added for phone, tablet, and desktop widths.

## Limits that remain explicit
- A production build and full integration test suite must run in a dependency-installed environment before deployment.
- ZIP import is limited to 40 text files and 1.4 MB per file; ZIP export currently includes up to 150 text files of at most 300 KB each and excludes binary/large files. GitHub API and Vercel request limits apply.
- Commits are executed by a live API request, not by a durable background worker. Keep the app open until the server confirms completion. A killed browser/WebView cannot guarantee completion without a separate persistent queue/worker deployment.
- The current inline editor is a functional plain-text editor, not a full IDE with language server, syntax-aware multi-cursor editing, conflict resolution, or terminal.
- Revert applies to the latest commit SHA on supported `fix/ai-*` review branches; it does not force-push or modify the default branch.
