# Update 2026-11-08: Vercel project selection + Codelab path error

## Vercel
- Import tab: every detected project has a checkbox in front and its assigned URL as a button below it. Ticking a project makes it the project for Variables, Logs and AI backend; unticking clears it. A single project is ticked automatically.
- Domain detection (server): production aliases, project aliases and latest-deployment aliases; custom domains listed before *.vercel.app.
- Variables: names for the ticked project, + to add, refresh button, auto-refresh on app focus and every 30 s.
- Logs: latest deployment log is shown first and stays live while building; older deployments below.
- AI backend: new "AI variables" card lists only AI keys/models/fallbacks (isAiVariable in src/lib/vercel-env.js), auto-refreshing.
- POST /api/vercel/project accepts projectId "" to clear the selection.

## Codelab "Invalid repository path"
- Server normalizeRepoPath now cleans leading "/", "./", spaces, control chars and "\" instead of rejecting, and the error names the received value. A folder path returns "is a folder, not a file".
- Project.jsx no longer requests a path that is blank or not in the repository tree; it clears the stale selection quietly.

Files: server/app.js, server/wytelab-github.js, src/lib/vercel-env.js, src/ui/VercelBackendWorkspace.jsx, src/ui/vercel/{ImportTab,LogsTab,VariablesTab,AiBackendTab}.jsx, src/ui/vercel/useProjectEnv.js (new), src/ui/codelab/pages/Project.jsx, src/ui/pothub-ui.css
