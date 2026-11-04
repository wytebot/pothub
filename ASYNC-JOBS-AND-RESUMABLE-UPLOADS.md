# Async jobs, streaming chat, and resumable uploads

## New endpoints

- `POST /api/agent/chat/stream`: genuine provider token streaming over SSE for Gemini, OpenAI-compatible, and Anthropic-compatible configured agents. The client sends `agentIds`, not API keys, for this route. Server-side lookup reads encrypted agent records from the account workspace. Legacy non-streaming routes remain compatible and still have older key-payload support; migration is not complete for every AI route.
- `POST /api/uploads/resumable`: creates a Firebase Storage resumable upload session. The response contains a short-lived bearer upload URL; do not log or share it. Upload chunks directly to the URL, not through a Vercel function body.
- `POST /api/uploads/:uploadId/complete`: verifies ownership, object metadata, and exact declared size. Max file size is 100 MiB.
- `POST /api/jobs`: persists a bounded job record and initial event in Firestore.
- `GET /api/jobs/:jobId`: returns durable status.
- `GET /api/jobs/:jobId/events`: streams resumable job events using SSE and `Last-Event-ID`.
- `POST /api/jobs/:jobId/cancel`: marks a job cancelled.
- `POST /api/internal/jobs/claim`: worker-only claim endpoint; leases up to three queued jobs.
- `POST /api/internal/jobs/:jobId/update`: worker-only progress/result update. Requires both `X-Pothub-Worker-Secret` and the per-job `X-Pothub-Job-Lease` returned by claim.
- `POST /api/codelab/scopes`: creates a signed, persisted, immutable repository/thread scope.
- `POST /api/codelab/scopes/verify`: validates a claim against the pinned owner/repo/branch and current thread record.
- `POST /api/codelab/scopes/delete`: revokes/deletes a pinned thread scope.
- `POST /api/codelab/agent/loop`: planner-driven, bounded, read-only repository tool loop (up to six tool steps) and final synthesis.

## Required environment

- `POTHUB_VAULT_ENCRYPTION_KEY`: dedicated vault key; ensure it matches the key used to encrypt existing agent records before deploying.
- `FIREBASE_STORAGE_BUCKET`: Firebase Storage bucket for resumable uploads.
- `POTHUB_APP_ORIGIN` or `APP_ORIGIN`: app origin used for upload-session origin metadata and CORS.
- `POTHUB_JOB_WORKER_SECRET`: random secret of at least 32 characters shared with a separately deployed worker. Generate with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.

## Worker contract and limitations

The job endpoints persist and stream durable state, but a separate worker process still has to poll `/api/internal/jobs/claim`, execute each supported `kind`, and update it through `/api/internal/jobs/:jobId/update`. This repository pass does not ship a production worker executor for every agent, image, video, and file job. Without a running worker, newly created jobs remain queued. Do not expose the worker secret to browser or APK clients.

Storage CORS must be applied to the actual bucket using `storage.cors.json`. Confirm the deployed origins, including `https://localhost` for Capacitor's HTTPS WebView scheme. Resumable URLs are bearer credentials; keep them out of analytics and logs.

## Codelab scope migration

The AgentPlanPanel now creates one scope per panel thread and includes the signed claim for planning, approved commits, and PR creation. Reusing a thread ID for a different repo or branch is rejected; start a new thread instead. Other legacy GitHub routes and the older non-streaming AI endpoints have not all been migrated to ID-only agent configuration or mandatory scope claims.
