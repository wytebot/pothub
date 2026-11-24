# Pothub Software Doctor operations

Pothub is a GitHub-first Software Doctor. GitHub is the source of truth for source code, branches, pull requests, Actions workflows and build logs. Vercel is the source of truth for projects, deployments and environment variables.

## Integrations and permissions

### GitHub

The GitHub OAuth flow requests `repo`, `workflow`, and `admin:repo_hook` scopes. The last scope is required because Pothub registers a `workflow_run` webhook for each repository the account explicitly selects. The hook points to `/api/webhooks/github` and uses `GITHUB_WEBHOOK_SECRET`. The server verifies `X-Hub-Signature-256`, deduplicates delivery IDs, checks the selected repository owners, and sends successful/failed build notifications only to users with an active paid plan and registered push tokens.

The first-time OAuth consent may need to be repeated to grant the additional repository-hook permission. Users must also enable notifications in the app and grant device/browser permission. GitHub must deliver a completed `workflow_run` event; Pothub cannot notify about a build event it never receives.

GitHub Actions workflow dispatch is supported only when the repository contains `.github/workflows/pothub-doctor.yml` and the token has Actions write permission. Do not execute untrusted pull-request code with privileged secrets. The source branch must not be directly overwritten by a repair.

### Vercel

Register `https://YOUR-POTHUB-DOMAIN/api/vercel/oauth/callback` as the Vercel OAuth callback and enable `openid`, `email`, `profile`, and `offline_access` scopes in the Vercel OAuth app. The application uses authorization code + PKCE (S256), state and nonce validation, and refresh-token rotation. Access and refresh tokens are AES-GCM encrypted before being stored in Firestore; the encryption key is derived from the Vercel OAuth client secret. Rotating that client secret invalidates the ability to decrypt existing stored tokens, so users must reconnect after such a rotation.

Project discovery uses the authenticated user's `/v9/projects` response. Deployment listing uses `/v6/deployments`. Project environment-variable names and metadata are listed without retrieving values. New values are passed directly to Vercel's `/v10/projects/{id}/env` API; Pothub does not write them to Firestore or job records. Environment changes apply to future deployments; a redeploy is needed for them to affect a running deployment.

## Plans

- Free: two selected repositories; ten repository diagnoses, then a five-hour cooldown.
- Pro: USD 5.99/month; ten selected repositories; no Pothub repository-analysis quota.
- Pro+: USD 9.99/month; unlimited selected repositories; no Pothub repository-analysis quota.

Prices are configurable with `PRO_MONTHLY_AMOUNT` and `PRO_PLUS_MONTHLY_AMOUNT`. Flutterwave charges the configured `PREMIUM_CURRENCY`. AI provider charges remain separate under BYOK. Existing request burst protection is retained to protect service availability; it is not a plan-based character or token allowance.

## Data handling

The app stores chat/editor state and locally configured BYOK keys on the device. The server stores Firebase account-linked integration tokens, selected repository names, plan/payment records, webhook delivery IDs, push tokens, job status and audit metadata. GitHub and Vercel store source files and environment values respectively. AI providers receive the repository snippets/logs required for a requested operation.

The legacy background text-job queue still persists encrypted request payloads and completed results to support resumable jobs. Therefore this release is **not zero-retention for chat/job content**. Do not advertise it as such until the queue is redesigned to store metadata only or the background feature is removed.

## Current operation boundaries

- The repository picker and server-side plan checks enforce selected repository counts.
- Build notifications require GitHub webhook delivery and user/device push registration.
- Vercel OAuth, project listing, deployment listing, and direct environment-variable creation/deletion are implemented in this update.
- Repair publishing writes the proposed patch to a separate branch, dispatches the validation workflow, and opens a pull request only after the workflow reports successful checks. The current AI conversation handoff is model-assisted; it does not yet autonomously generate and apply a patch from a full repository snapshot.
- The Doctor page now includes an Ask Pothub composer that hands repository/run/job context to the local Ask Pothub conversation. Conversation history remains in local IndexedDB; it is not stored as chat history on the Pothub server.
- GitHub Actions workflow installation is not automatic. A repository needs the current `templates/pothub-doctor.yml` installed at `.github/workflows/pothub-doctor.yml` before diagnosis/validation dispatch can work. The workflow extracts bounded GitHub logs, runs supported repository checks, and creates a repair PR only after successful validation.

## Vercel server environment

See `VERCEL-ENVIRONMENT-VARIABLES.md` for the full required and optional list. Never add secrets with a `VITE_` prefix. Firebase web SDK configuration is embedded in `src/firebase.ts`; Firebase Admin service-account JSON remains server-only.
