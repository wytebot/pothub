# Pothub background jobs — Vercel + Firebase (no Railway)

Pothub's web app and HTTP API stay on Vercel. Firestore stores durable job state and encrypted provider payloads. Firebase Functions 2nd gen + Cloud Tasks execute jobs asynchronously; the client reads progress through the existing authenticated `/api/jobs/status` endpoint.

## Architecture

1. Vercel `/api/jobs` authenticates the Firebase ID token, enforces quota/rate limits, encrypts the provider request with AES-256-GCM, and creates `jobs/{jobId}` with `status: queued`.
2. `enqueuePothubJob` (Firestore create trigger) enqueues only the job ID in the `processPothubJob` Cloud Tasks queue. Provider keys are not copied into task payloads.
3. `processPothubJob` claims the job in a Firestore transaction, holds a renewable 90-second lease, persists streamed output, honors cancellation, and clears encrypted credentials after execution.
4. Cloud Tasks retries transient execution failures. The lease prevents concurrent duplicate execution; completed/cancelled jobs are idempotently ignored.
5. Vercel remains the public API. The browser never receives service-account credentials or the job encryption key.

## One-time Firebase setup

Use the Firebase project `pothub-ca2a1` (or change `.firebaserc` if deploying to another project). Install Firebase CLI locally or in your deployment environment, then:

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
npx firebase-tools login
npx firebase-tools use pothub-ca2a1
npx firebase-tools functions:secrets:set BACKGROUND_JOB_ENCRYPTION_KEY
npx firebase-tools deploy --only firestore:rules,functions
```

When prompted for `BACKGROUND_JOB_ENCRYPTION_KEY`, provide a **64-character hexadecimal** key generated once:

```bash
openssl rand -hex 32
```

Set that exact same value in Vercel Project → Settings → Environment Variables as `BACKGROUND_JOB_ENCRYPTION_KEY` for Production, Preview, and Development as appropriate. Never use a `VITE_` prefix. Do not rotate it while jobs encrypted with the old key remain queued; rotation requires draining the queue or re-encrypting those records.

The Firebase Functions runtime uses its attached service identity (Application Default Credentials). Ensure that identity has Firestore read/write access and Cloud Tasks enqueuer permission. The deployer needs permission to deploy Cloud Functions, create/manage Cloud Tasks queues, and bind runtime IAM. Enable the Cloud Functions, Cloud Build, Artifact Registry, Eventarc, Cloud Tasks, and Firestore APIs if prompted by deployment.

## Firestore TTL

Enable TTL on `jobs.expiresAt` (Firestore TTL policy is configured in Google Cloud Console → Firestore → Time-to-live, collection group `jobs`, field `expiresAt`). TTL cleanup is asynchronous. Do not rely on it for exact-time deletion.

## Vercel settings

Keep the existing Vercel project settings and `/api/*` routes. Set at minimum:

- `FIREBASE_SERVICE_ACCOUNT` — service account JSON for the Vercel API (or use the existing supported ADC arrangement in your hosting environment).
- `BACKGROUND_JOB_ENCRYPTION_KEY` — same 32-byte key configured as a Firebase Functions secret.
- `APP_ORIGIN=https://pothub-self.vercel.app` (replace with the actual production origin if changed).

The frontend should call same-origin `/api/jobs`, `/api/jobs/status`, and `/api/jobs/cancel`. Do not configure `VITE_API_URL` or a Railway origin.

## Operational limits and safety

- Cloud Tasks function timeout is 30 minutes. The worker aborts at 28 minutes so it can persist a terminal result before platform termination. A task that exceeds this limit is not an indefinitely running process; split very long workflows into smaller jobs if needed.
- Task queue dispatch is capped at 2 tasks/second and 10 concurrent executions by default. Tune only after observing provider limits and Firestore costs.
- Each user is limited to four active queued/running jobs; global queue admission is capped in the API.
- Provider keys are encrypted at rest in Firestore and exist in worker memory only during execution. Never log request bodies, provider keys, decrypted payloads, or full provider errors.
- Firestore rules deny direct client reads/writes. The API and Functions use Admin SDK IAM. Keep that rule in place.
- Cloud Tasks is at-least-once delivery. The transaction lease is required; do not remove it. Monitor task retries, function errors, Firestore quota, and stuck `running` jobs.
- If the create trigger cannot enqueue a task, its retry policy retries the trigger. If task execution fails, Cloud Tasks retries according to the configured retry policy.

## Smoke test after deployment

1. Confirm `GET https://pothub-self.vercel.app/api/billing/config` returns JSON (API routing check).
2. Sign in to Pothub and submit a short background response using a valid provider key.
3. Confirm a `jobs/{jobId}` document appears with `queued`, then `running`, then `done` (or a meaningful provider error).
4. Confirm status is visible through `/api/jobs/status` while signed in and cancellation works for a second test job.
5. Confirm Cloud Tasks queue `processPothubJob` has no growing retry backlog and Functions logs contain no secrets.
6. Test a failed/invalid provider key and verify a safe error is shown and the job reaches a terminal state.

A successful local build does not prove cloud IAM, secrets, API enablement, Cloud Tasks delivery, or provider connectivity. Complete the smoke test before calling the deployed worker production-verified.
