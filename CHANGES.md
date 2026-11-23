# Codelab tool navigation wiring

- Added dedicated workspace tool views for Files & editor, Branches, Pull request, Upload files, Copy/Export, Quality & review, Sandbox and Repository settings.
- Each tool view has a back-to-files action.
- Replaced the action-clutter toolbar with horizontally scrollable tool navigation on mobile.
- Added view-specific actions wired to existing GitHub/editor functions.
- Files/editor and terminal content are hidden while other tool views are active.
- Existing commit controls remain in the workspace and staged changes remain visible.
- Verified TSX transpilation syntax with global TypeScript transpiler (no diagnostics).
- Full typecheck and Vite build not run because dependencies are not installed.
