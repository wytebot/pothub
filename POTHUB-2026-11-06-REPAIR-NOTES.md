# PotHub repair notes — 2026-11-06

## Applied source fixes
- Vercel OAuth callback selection now honors `VERCEL_REDIRECT_URI` (and `POTHUB_API_ORIGIN` / `APP_URL` fallbacks) instead of unconditionally sending the built-in callback. `VERCEL_REDIRECT_URI_OVERRIDE` remains the highest-priority override.
- Added a regression assertion for callback source precedence.
- Repository file-path validation now trims surrounding whitespace, normalizes Windows separators, rejects empty/traversal/control-character paths, and returns an actionable `INVALID_REPOSITORY_PATH` error while preserving nested repository-relative paths.

## Not yet implemented
The requested long-document ingestion/continuation pipeline, PDF result attachments, ZIP artifact generation/commit UX, Vercel project import/backend configuration/deploy UI, durable build-job orchestration, and build-log-to-agent repair ZIP loop are not completed by these narrow repairs. They require coordinated server, storage, UI, job-worker, and integration tests; this archive must not be represented as having those features.

## Vercel deployment configuration
Set `VERCEL_REDIRECT_URI` in the PotHub Vercel project's server-side environment variables to exactly:
`https://pothub-self.vercel.app/api/vercel/callback`

Then add that exact URL to the Vercel OAuth application's Authorization Callback URLs, redeploy PotHub, and start a fresh authorization attempt. Do not set this as a `NEXT_PUBLIC_` variable. If the production deployment uses another domain, use that domain consistently in both places.
