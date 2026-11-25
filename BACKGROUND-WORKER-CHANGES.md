# Background worker integration changes

- Added Firebase Functions v2 Firestore create trigger to enqueue jobs into Cloud Tasks.
- Added a task-queue worker that claims jobs transactionally, renews leases, supports cancellation, persists streaming output through the existing job engine, and sends completion push notifications.
- Added a scheduled recovery function to re-enqueue queued jobs and reclaim jobs whose worker lease expired after an interrupted execution.
- Kept provider payloads encrypted in Firestore; task payloads contain only the job ID.
- Added Firebase deployment configuration, Node 22 Functions build configuration, Firestore rules deployment, and a production setup/smoke-test guide.
- Kept Vercel as the same-origin web/API host. No Railway URL or `VITE_API_URL` is required.

The Firebase deployment and production smoke test still require the project owner's Firebase IAM/API setup and secrets. A local build could not be run in this environment because npm dependency installation did not complete.
