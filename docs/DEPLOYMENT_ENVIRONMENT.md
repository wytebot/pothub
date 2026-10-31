# Canonical deployment origins

Use these canonical origin variables in Vercel:

- `POTHUB_API_ORIGIN`: the public origin serving Express API routes (for example `https://api.example.com`).
- `POTHUB_APP_ORIGIN`: the public origin serving the Next.js UI and allowed browser origin (for example `https://app.example.com`).

Legacy aliases remain accepted during migration: `APP_URL` maps to `POTHUB_API_ORIGIN`; `FRONTEND_URL` and `APP_ORIGIN` map to `POTHUB_APP_ORIGIN`. If both canonical and legacy values are set, the canonical value wins. Values must be absolute HTTP(S) origins with no path, query, credentials, or fragment; production requires HTTPS. Remove the legacy variables after migrating Vercel and OAuth callback settings.

For a same-origin deployment, set both canonical variables to the same origin. For split frontend/API deployments, use their separate origins. GitHub OAuth callback must be `${POTHUB_API_ORIGIN}/api/auth/github/callback`.
