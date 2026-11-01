# PotHub repository Edit and log discovery update

## Implemented

- Diagnosis accepts log payloads up to 250,000 characters; preprocessing still redacts secrets, removes duplicate/progress noise and bounds the model context to 42,000 characters. This fixes the 22,000-character Zod rejection without forwarding unbounded logs to the model.
- GitHub Actions runs continue to be discovered on repository selection. The newest completed failed run is automatically selected and its job/step/raw archive logs are fetched when no log text is already present. Manual run selection remains available.
- Added per-developer Vercel OAuth (PKCE, state cookie, authorization-code exchange, encrypted per-user token storage, rotating refresh tokens), project discovery/selection, deployment discovery and deployment-event retrieval. If OAuth is not configured, the app explains which server variables are missing.
- Added repository-aware Edit chat. The server reads repository metadata, an indexed path list, core configuration files and prompt-relevant source files before invoking the selected internal or external Chat agent. The prompt requires evidence-based repo answers and complete file code blocks with explicit paths/languages.
- Generated code blocks render as editable code areas. Developers can choose an existing repository file or choose a new file path, then commit that file to a dedicated `pothub/repair-*` review branch. The default branch is not silently modified.
- Repository file discovery and file inspection limits were raised to support larger repositories and text files up to 1 MB. The editor/commit flow remains bounded to protect serverless requests and AI context.
- Added compact mobile-first styling for the Edit transcript, code editor and composer.

## Vercel configuration

Vercel deployment discovery now uses per-developer Sign in with Vercel OAuth. Set `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET`, and the exact `VERCEL_REDIRECT_URI` in the PotHub server environment. Register `https://YOUR-POTHUB-DOMAIN/api/vercel/callback` as an Authorization Callback URL in the Vercel OAuth app. Enable the `openid`, `email`, `profile`, and `offline_access` identity scopes, plus the Vercel app permissions for listing projects and reading deployments/events.

Developers connect from Developer workspace → Deployment logs → Connect Vercel, then select one of their discovered projects. Access and rotating refresh tokens are encrypted per PotHub user in Firestore; tokens are never sent to the browser. No shared `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, or `VERCEL_TEAM_ID` is required. `VERCEL_REDIRECT_URI` must exactly match the registered callback. See `ENVIRONMENT_VARIABLES.md` for setup.

## Verification

- `node --check server/app.js`: passed after the Vercel OAuth wiring.
- TypeScript JSX transpile/parser diagnostics for `src/ui/App.jsx` and `src/ui/WorkspaceSection.jsx`: 0 diagnostics.
- Focused tests: 8/8 passed (`ai-safety`, `github-repositories`, `provider-health`).
- Full test command: 84 passed, 16 could not load because this working container did not have the declared npm dependencies installed (`express`, `firebase-admin`, `typescript`, etc.). `npm install` timed out, so a production Next/Vercel build and live GitHub/Vercel credential tests could not be completed here.

## Important limits

- GitHub Actions raw logs are capped during archive extraction and model context is bounded after preprocessing.
- Repository file listing returns up to 5,000 paths; GitHub's recursive tree API may itself mark exceptionally large trees as truncated.
- Individual source inspection is capped at 1 MB and generated file commits at 90 KB per file in the current safe commit route.
- Commits are created on a review branch. Developers should inspect the branch and run CI before merging.
