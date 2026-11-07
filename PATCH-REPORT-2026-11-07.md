# PotHub engineering patch — 2026-11-07

## Scope

This patch updates the supplied `pothub-main (13).zip` source. It contains only the 18 files changed for this pass, plus this report.

## Implemented

### Chat and agent behavior
- Streamed Creator responses now default to English unless the user explicitly requests another language.
- The shared engineering response protocol is applied to streamed Creator requests, not just the dedicated developer endpoints. Substantial answers are instructed to explain the request, assumptions, result, relevant reasoning, and limitations. Technical work must distinguish actual checks from suggested commands and must not claim tests/builds ran when they did not.
- Normal chat requests and assistant placeholders are persisted before provider execution. Provider/configuration failures update the saved assistant message instead of losing the request.
- Image-generation requests and image-to-video requests persist their user message and attachments before provider execution. Gemini image generation receives compressed reference-image parts.
- Editing and regenerating a user request reuses the existing message ID and truncates only later messages in that same chat.
- Chat switching/deletion aborts the active chat workflow and guards against late responses overwriting another chat.
- Image, video, image-to-video, diagnosis, repair, commit, and verification workflows now expose cancellation controls where their requests can be aborted. The Codelab agent plan/commit/PR panel also has a Stop workflow control.
- Composer attachment thumbnails are previewed before send, and sent attachment references/blobs are saved before the composer clears.
- The composer uses `visualViewport` measurements and sticky positioning to rise with the Android/browser keyboard.
- The app font-size preference now scales the whole app shell, including chat text and Codelab text.

### Repository ZIP delivery and commits
- Repository-chat assistant ZIP attachments show a **Commit ZIP to GitHub** action.
- The commit flow unpacks the ZIP, preserves repository-relative paths, strips a matching repository-name wrapper folder, skips dependency/build folders and secret/key files, rejects traversal paths and binary/oversized payloads, and commits approved text files to a review branch using the existing scoped GitHub commit API.
- The commit result is written back to the originating chat only; switching chats cannot append the result to another conversation.
- The ZIP commit action can be stopped locally while in flight. A GitHub operation already accepted remotely cannot be rolled back automatically; the UI reports this distinction.
- Repository path normalization now accepts harmless `./` segments and Windows separators while still rejecting absolute paths and `..` traversal. This addresses the `INVALID_REPOSITORY_PATH` error shown in the supplied screenshot.

### Vercel backend
- Added GitHub repository import into the connected Vercel account, with GitHub repository verification and a clear GitHub App authorization error.
- Added an inline multi-row environment-variable editor (up to 100 entries), encrypted/plain values, deployment targets, Cancel, Save, and Save & deploy actions.
- Environment variable values are sent to Vercel but are not returned or logged by PotHub. Partial saves report saved variable names only.
- Added a direct Vercel environment-settings link for the selected project, with team-aware routing where the team slug is available.
- Reworked repository selection to avoid native browser dropdowns and fixed the backend workspace's unstable load effect so it does not refetch in a render loop.

### Logs and Codelab
- Added a Build logs navigation entry and page covering GitHub Actions runs and Vercel deployments.
- Failed builds expose a Fix action that fetches the selected logs and prepares a repository-scoped repair prompt in the normal chat composer.
- Removed the nonfunctional Google Drive export/disconnect controls and their 501 endpoint rather than leaving dead Codelab actions visible.
- Audited Codelab buttons for missing/empty click handlers; no empty-handler toolbar buttons were found in the scanned Codelab source.
- GitHub account linking now requests the GitHub-specific one-time link ticket instead of the Google-auth ticket endpoint, preserving provider-independent sign-in/linking.

## Verification performed

- JavaScript syntax checks passed for `server/app.js`, `server/wytelab-github.js`, `src/lib/video-adapters/gemini.js`, and `src/ui/codelab/github.js`.
- TypeScript's JSX parser/transpiler reported syntax OK for `App.jsx`, `WorkspaceSection.jsx`, `VercelBackendWorkspace.jsx`, `AgentPlanPanel.jsx`, and `GitHubHub.jsx`.
- Focused regression tests: **66 passed, 0 failed**.
- Full test suite: **372 passed, 17 failed** out of 389. The 17 failures are test files that cannot load because the supplied working directory has no installed dependencies (`express`, `firebase-admin`, `@hapi/iron`, `jszip`, and `typescript`).

## Not verified / remaining limitation

- `npm install` did not complete in this environment. `npm run build` stopped in `scripts/prepare-next-assets.mjs` because the PDF.js worker dependency was absent; Next.js production compilation therefore did not run.
- This application source does not currently provide a general-purpose local/remote shell executor to the Creator agent. The shared protocol requires agents to run syntax/tests/`npm run build` only when an execution environment is actually available and to report when it is not. GitHub Actions and Vercel build logs are available after the relevant workflow/deployment runs, but this patch does not fabricate a successful terminal build.
- OAuth linking, GitHub commits, Vercel project import, environment-variable writes, and real deployments still require the user's connected GitHub/Vercel accounts and their provider permissions. No repository commit or Vercel deployment was performed by this patch.
- A cancellation request can stop client-side generation and abort supported requests. It cannot reverse a remote GitHub/Vercel action that the provider has already accepted.

## Apply

Extract this ZIP at the repository root, preserving the included relative paths. Install the repository's dependencies in a network-enabled environment, then run `npm test` and `npm run build` before deploying.
