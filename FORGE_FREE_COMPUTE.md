# Pothub Forge — no-paid-hosting pilot

Forge is part of Pothub. The included `Pothub Forge Free Worker` workflow is a **manual, GitHub-hosted CI pilot** for validating public GitHub repositories. It does not require Railway, a VPS, Docker on your phone, or a self-hosted server.


## Run from a phone
1. Push this repository to GitHub.
2. Open the repository on GitHub mobile/web.
3. Open **Actions** → **Pothub Forge Free Worker** → **Run workflow**.
4. Enter a public GitHub repository HTTPS URL; optionally specify a branch/tag/commit; select `auto` or an engine.
5. Review the workflow run result and logs.


## Cost boundary
This uses GitHub-hosted Actions runners. Public-repository standard hosted runner usage is generally free under GitHub's current policy, but GitHub policies/limits can change and availability is not guaranteed. This workflow is not a promise of unlimited free compute. It is deliberately manual to avoid surprise usage. Do not enable automatic dispatch or concurrency increases without budget controls.


## Security boundary
- Only public repository URLs are accepted by the workflow input validation.
- Workflow permissions are read-only (`contents: read`).
- Checkout credentials are not persisted (`persist-credentials: false`).
- The workflow is manual (`workflow_dispatch`) and has a 15-minute job limit.
- Build/test commands execute untrusted repository code on an ephemeral hosted worker. Do not add secrets, write permissions, deployment credentials, or privileged actions to this job.
- This workflow validates public GitHub repositories only. It is not yet an app-integrated arbitrary ZIP upload execution API. That requires a separately reviewed secure dispatch/storage design and abuse controls.


## Supported initial checks
Node/npm, Python compile/tests, Go tests, and Rust tests. Flutter/Android and Docker-in-Docker are not enabled in this free worker because they can consume significant minutes and have additional execution/security requirements.

## Backend dispatch (optional app integration)
The `api/forge.js` endpoint dispatches this workflow from Pothub backend after Firebase ID-token verification, allowlist verification, per-user throttling, and a GitHub public-repository check. Configure these server-only Vercel variables:
- `POTHUB_FORGE_REPOSITORY`: owner/name of the public Pothub repo containing the workflow
- `POTHUB_FORGE_BRANCH`: branch containing the workflow (default `main`)
- `POTHUB_FORGE_GITHUB_TOKEN`: fine-grained GitHub token restricted to that repo with Actions: write and Metadata: read
- `POTHUB_ALLOWED_EMAILS`: verified email allowlist used by the endpoint

Call `POST /api/forge` with Firebase bearer auth and JSON `{ "repositoryUrl": "https://github.com/owner/repo", "ref": "main", "projectType": "auto" }`. It returns `202 queued` after GitHub accepts dispatch. This API does not yet stream/poll run results into the chat UI. Keep the token secret, set a low token expiry, and never expose it in Vite/client env.
