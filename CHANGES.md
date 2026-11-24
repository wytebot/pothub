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
