# Pothub Software Doctor — deployment and integration setup

## Included operations

- Repository selection and plan enforcement (Free 2, Pro 10, Pro+ unlimited).
- GitHub workflow/run listing, bounded log retrieval and extraction, durable diagnosis job records, dispatch and polling.
- GitHub Actions checks for Node scripts, Python syntax/tests when pytest is available, Go, Cargo, Maven, Gradle and .NET.
- Repair branches and commits are prepared separately. The workflow opens a pull request only after supported validation checks pass; it never commits directly to the source branch.
- Ask Pothub hands repository/job/log context into the existing local chat engine. Conversation history stays in device IndexedDB.
- Per-user Vercel OAuth, project discovery, deployment listing and direct environment-variable writes/deletes. Environment values are sent to Vercel and are not stored in Pothub.
- Paid-plan build notifications use GitHub workflow-run webhooks and registered push tokens.

## GitHub setup (each repository)

1. Connect GitHub in Codelab and reconnect after changing OAuth scopes. The OAuth app requests `repo`, `workflow` and `admin:repo_hook`.
2. Copy `templates/pothub-doctor.yml` into the repository at `.github/workflows/pothub-doctor.yml` and commit it to the default branch. GitHub requires a workflow configured for `workflow_dispatch` before the dispatch API can trigger it.
3. In repository Actions variables, set `POTHUB_DOCTOR_CALLBACK_URL` to `https://YOUR_POTHUB_DOMAIN/api/doctor/webhook`.
4. In repository Actions secrets, set `POTHUB_DOCTOR_WEBHOOK_SECRET` to a random secret of at least 32 bytes. Set the same value as `DOCTOR_WEBHOOK_SECRET` in Vercel.
5. In repository Actions settings, enable GitHub Actions and allow workflows to create pull requests. The workflow requests only `contents: read`, `actions: read` and `pull-requests: write` permissions. Organization policy can override repository settings.
6. For successful/failed build notifications, configure `GITHUB_WEBHOOK_SECRET` in Vercel. Selecting repositories registers the signed `workflow_run` webhook.

GitHub's workflow-dispatch endpoint requires Actions write permission for fine-grained tokens (the OAuth app uses the `repo` scope for classic OAuth); run-log download requires Actions read. Pull-request creation with `GITHUB_TOKEN` also requires the repository setting that allows Actions to create pull requests. See GitHub's official REST and Actions documentation.

## Firestore

- Enable Firestore in the Firebase project used by Pothub.
- Configure `FIREBASE_SERVICE_ACCOUNT` in Vercel for Firebase Admin access.
- `doctorJobs` records are server-only; do not add client write access to this collection.
- Configure a TTL policy for `expiresAt` on `doctorJobs` if automatic expiry is desired. TTL is cleanup, not access control.

## Vercel

- Configure `VERCEL_CLIENT_ID` and `VERCEL_CLIENT_SECRET`; no shared `VERCEL_TOKEN` or static project allowlist is used.
- Set the Vercel OAuth callback to `https://YOUR_POTHUB_DOMAIN/api/vercel/oauth/callback`.
- See `VERCEL-ENVIRONMENT-VARIABLES.md` for the complete server variable checklist.

## Honest capability boundary

The diagnosis workflow collects repository evidence and runs checks; it does not itself call an AI model to produce a root-cause narrative. Ask Pothub sends the available job/run/log context to the selected local AI provider. Fully autonomous repository-wide AI patch generation, diff review and application from the Doctor screen is still not implemented. A repair branch is only produced when a proposed patch is submitted; validation happens before PR creation. No automatic merge is performed.
