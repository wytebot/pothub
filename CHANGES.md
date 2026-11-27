# Codelab redesign (0.12.0)

- Codelab is now three screens: Repos (continue card, stats, filter chips, repo cards, new repo), Workspace (folder/file tree with expandable folders, horizontal tool bar, commit bar) and Editor (opens inside the workspace with the editing tool bar and file tabs).
- Vercel, GitHub, branches, pull requests, quality, sandbox, export, settings, add license and delete actions moved into one more menu.
- Wired to the existing GitHub, staging, commit, sandbox and Capacitor logic; no behavior was removed.
- Typechecked Codelab.tsx for syntax and unused variables only (dependencies are not installed here); run npm run build before deploying.

# Codelab tool navigation wiring

- Added dedicated workspace tool views for Files & editor, Branches, Pull request, Upload files, Copy/Export, Quality & review, Sandbox and Repository settings.
- Each tool view has a back-to-files action.
- Replaced the action-clutter toolbar with horizontally scrollable tool navigation on mobile.
- Added view-specific actions wired to existing GitHub/editor functions.
- Files/editor and terminal content are hidden while other tool views are active.
- Existing commit controls remain in the workspace and staged changes remain visible.
- Verified TSX transpilation syntax with global TypeScript transpiler (no diagnostics).
- Full typecheck and Vite build not run because dependencies are not installed.

## Build + home scroll fix
- Codelab.tsx: removed `repo?.id` comparison in the repo list (repo is narrowed to null there, TS2339) and wired `createFolder` to a "New folder" button beside "New file" (TS6133).
- styles.css: locked page-level scroll (html/body/#root/.shell); `.main` holding the chat home or welcome screen no longer scrolls, so only `.chat-thread` scrolls.

## 0.12.1
- Build: `VITE_FIREBASE_VAPID_KEY` (the public web-push key) was rejected by the public-env guard in `vite.config.ts` because its name ends in `_KEY`, so setting it in Vercel made `npm run build` fail with "Refusing to build". It is now allow-listed next to `VITE_FIREBASE_API_KEY` and documented in `.env.example`.
- Removed the unused duplicate `security/api.ts` at the project root (the app uses `src/security/api.ts`).
- Package layout: files sit at the zip root (no wrapping folder), so Vercel finds `package.json` at the repository root.

## 0.13.0 — Repositories: Vercel and GitHub deployment
- **Repositories page (replaced in 0.15.0 by Deployments).** Two header menus, *Vercel deployment* and *GitHub deployment*; the Codelab editor was removed in this version and returned in 0.15.0.
- **Vercel deployment.** Connect with a Vercel access token (kept on the device, sent only to the new `api/vercel/[action].js` bridge for the request). Two cards: *Build steps* (clone, install, build, deploy, with the one that failed) and *Error* (the first real failure in the build log). The **Analyze** button opens a popup chat that reads the failed build and the affected repository files with your configured models, explains the root cause and lists the affected files. **Fix** then writes the corrected files, checks them (no truncated or placeholder code, valid JSON, balanced brackets, no new secrets) and commits them to the branch in one commit, replacing the old files.
- **GitHub deployment.** The repository's deployments and workflow runs; for a failed run: Analyze, re-run failed jobs, open on GitHub. Analyze and Fix work the same way as on the Vercel page.
- **Large files are sent in chunks.** Repository material goes to the models in parts (30k characters each, two at a time) and is reduced to notes before the answer; if a provider still refuses a request as too large, the parts are halved and retried.
- **Ask MonyGist can read repositories.** Type `@` in the composer to open a list of your repositories. Each has two tick boxes: *Once* (the tag leaves after the message is sent) and *Keep* (stays until removed). The message carries the account and repository name, the file list and the files the question points at.
- **Terminal workflow.** The popup shows every step as terminal lines (`git ls-tree`, `git show`, `edit src/…`, `git commit && git push`) and accepts `/files`, `/log`, `/diff`, `/fix`, `/stop` and `/help`.

## 0.14.0 — Sign in with Vercel, fact-check fixes
- **Sign in with Vercel.** The Vercel menu now has a *Connect Vercel* button that uses your Vercel App's client id and secret (server variables `VERCEL_APP_CLIENT_ID` and `VERCEL_APP_CLIENT_SECRET`; callback `https://YOUR-DOMAIN/api/auth/vercel/callback`). PKCE (S256) is used, the code verifier stays in the browser tab, the secret stays in `api/auth/vercel/[action].js`, access tokens (1 hour) are renewed with the refresh token, and disconnecting revokes the token. A pasted access token still works under *Use an access token instead*. Note: Vercel documents the API permissions of Sign in with Vercel (the part that lets a token read deployments) as a private beta; if Vercel refuses the token, the page says so and the pasted token path keeps working.
- **Menu text.** Items in the collapsible *More* menu are larger (17px, taller tap targets).
- **Fact-check fixes.** AI Providers: Anthropic keys now point to platform.claude.com (the Claude Console); Together AI calls `api.together.ai/v1` as in its current docs; provider billing lines no longer say "MonyGist is free" (MonyGist has a Premium plan) and now say API usage is billed by the provider, not by MonyGist. Configured websites and Billing: "Pro" renamed to "Premium" everywhere users read it. Billing/Home/commit menu: "Codelab" replaced by "Repositories". Privacy Policy: new *Repositories (GitHub and Vercel)* section describing where tokens live and what is sent to AI providers. README: removed claims that no longer held (the Codelab editor, "token remains in memory", "no MonyGist GitHub backend", "five saved URLs on Free").
- **Fix.** Disconnecting GitHub on the Repositories page revokes a GitHub sign-in token again (0.13.0 only forgot it).

## 0.15.0 — Deployments page, Codelab restored
- **Codelab is back** as it was (repository list, editor workspace, staging, commits, sandbox preview, terminal), except that its AI hand-off buttons (Ask MonyGist, AI review of staged files) stay removed so chat lives only in Ask MonyGist.
- **New Deployments page** (menu and the + menu in Ask MonyGist). Two header menus, *GitHub deployment* and *Vercel deployment*. Each has two cards: *Build steps* and *Build logs* (failing lines marked, opening on the first failure). GitHub shows the chosen workflow run (latest by default) with its jobs and steps; Vercel shows the latest deployment of the chosen project.
- **Analyze** appears when a build failed and opens a large chat popup. A faded live timeline shows the agents (models) and terminal actions as they work (`git ls-tree`, `git show`, reading parts, writing the explanation), then an extensive explanation of the bug: what happened, root cause, evidence, affected files, why it breaks the build, how to fix it, how to confirm, how to prevent it. You can scroll while it writes; the view stops following when you scroll up.
- **Fix** appears after the explanation. It locates the affected files fresh from the branch, plans the change, writes the corrected code, checks it, commits it in one commit and shows a success message with the files and line counts. The same timeline runs through all five phases.
- Sign in with Vercel now returns to `/#/deployments`.

## MonyGist 0.16.2 (chat actions, crawl consent and project delivery)
- Prompt-aware provider/model routing, verified configured-site crawling, case-sensitive custom env-variable names and ordered comma model fallbacks.
- Chat-based confirmed GitHub Actions variables/workflow dispatch/run status and Vercel plain variable/deployment listing.
- Generated project ZIPs are commit-only in chat (no download control), with create/select GitHub repository and bounded binary-aware commits.
- Codelab editor and sandbox terminal tools expanded; continuity recall improved; appearance page removed while system theme remains.
- Full dependency-based build/tests remain pending because install timed out.

## 0.16.4 audit-fix patch
- Added a React crash boundary and global runtime error/rejection logging with non-blocking notification event.
- Background job start failures and missing job service now fall back to local generation with a short user note.
- Guest authentication accepts both legacy and MonyGist guest headers; CORS allows both.
- Site origin now uses VITE_SITE_ORIGIN/SITE_ORIGIN with the legacy default retained.
- Background polling now fails after repeated errors, uses backoff, and gives clear sign-in failures while retaining job ID.
- Automatic web search skips file-attached/repository-tagged requests and short command prompts.
- File packaging errors are handled after generation and preserve the generated answer.
- Vercel per-instance limiter prunes stale keys when the map grows.

## PWA, Vercel Backend and long-context handling
- PWA: enhanced manifest identity, standalone display modes, install prompt and offline fallback page/cache.
- Removed environment variable editor from Vercel deployment page; moved it to separate collapsible-menu Vercel Backend page.
- Added project environment variable list/create/update/delete endpoints, including secret/rotation entry flow and deployment targets.
- Repository/file chunking retained; input is unlimited at the composer level, provider limits are handled by chunk/continuation workflow.

- Expanded GitHub Actions repository environment UI to manage variables and encrypted secrets (create, edit, rotate, delete, refresh); redesigned controls and cards with non-pill corners.


### Integration persistence and deliberate disconnect (2026-11-27)
- GitHub OAuth disconnect now revokes before deleting local credentials; failed revocation preserves the saved token and connected state. PAT disconnect is confirmed and explains that provider-side revocation must be done manually.
- Vercel OAuth disconnect now requires successful revocation before removing the saved credential; failed revoke preserves it. PAT disconnect is confirmed and directs users to revoke at Vercel.
- Added explicit disconnect confirmation and visible post-disconnect status messages. Existing provider credentials and repository workspace drafts are not cleared by these disconnect flows.
- Invalid/expired GitHub credentials and failed Vercel refresh attempts no longer silently delete saved tokens; credentials remain until deliberate disconnect/removal.
- Codelab ZIP imports now merge by path: uploaded files replace matching repository paths, new files are added, untouched files remain; binary ZIP assets are staged as base64 for GitHub blob uploads, and duplicate ZIP paths are rejected before staging.
- Fixed Vercel Backend route icon to use an icon supported by the app's icon registry (resolves TS2322).
- Added a local TypeScript declaration for `libsodium-wrappers` (resolves TS7016 when type declarations are unavailable).
- Added copy-full-log buttons to GitHub and Vercel deployment log cards with success/error status feedback.
