# Vercel reauthentication fix

**Problem:** `Not authorized: Trying to access resource under scope "wytebot" … (VERCEL_REAUTH_REQUIRED)`.
`/api/vercel/projects` aborted on the first scope Vercel refused, so every project (0 shown) was lost and the UI printed the raw error.

## Server (`server/app.js`)
- `/api/vercel/projects` now loads each scope independently. A refused scope no longer blocks the others; it comes back as `scopeIssues`.
- `vercelApi` picks a per-scope token from the `teamId` in the request path, and reports the refused scope (`scope` in error JSON).
- New: `GET /api/vercel/reauth/scopes` (live check of default scope + every team), `POST /api/vercel/reauth/token` (tests a token against the exact scope, then saves it encrypted per scope), `DELETE /api/vercel/reauth/token?teamId=`.
- `/api/vercel/status` also lists saved scope tokens.

## App
- `src/ui/vercel/ReauthSheet.jsx`: scope list with Confirmed / Needs confirmation; per scope: confirm on Vercel, sign in again, or verified scope token. Re-checks automatically when you return to the app.
- `VercelBackendWorkspace.jsx`: warning banner with **Confirm access**; Variables, AI backend, Projects and Deploy reauth prompts now open the sheet.
- `vercel-env.js` / `App.jsx`: reauth detection also works from the message text; the refused scope is passed to the UI.
