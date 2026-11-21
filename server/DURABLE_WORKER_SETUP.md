# Pothub durable background worker

Background requests now enter Firestore as `queued` jobs. The API encrypts the provider request payload with AES-256-GCM before persisting it; the provider key is never stored in plaintext. The separate worker claims jobs transactionally, renews its lease, saves streamed output every two seconds, and can reclaim jobs after a worker process crashes or its lease expires.


## Required server environment

- `BACKGROUND_JOB_ENCRYPTION_KEY`: a dedicated 32-byte key encoded as base64 or 64 hex characters. Generate with `openssl rand -hex 32`. Keep it stable across all API and worker instances. Losing/rotating it without re-encrypting queued payloads makes queued jobs undecryptable.
- Existing Firebase Admin credentials / application-default credentials with Firestore read-write access.

## Worker deployment

Run a long-lived worker process alongside the API service, not as a Vercel request handler:


```sh
cd server
npm install
npm run worker
```

Deploy the worker on a process host with a restart policy (e.g. container worker, VM, or managed background service). It may share the same Firestore database with the API. Keep at least one worker running. API deployments can remain serverless; job execution is decoupled.

## Firestore usage

- Job start: reads user's active jobs and queue depth, then writes the encrypted job record.
- Worker: query for queued jobs, transactionally claims a job, heartbeat writes lease/status metadata, and streamed result writes approximately every two seconds.
- Status polling: one document read per poll; the app's polling cadence is currently unchanged.
- Completion: job status/result is saved; encrypted provider payload is cleared.

Configure Firestore TTL on `expiresAt` for the `jobs` collection to expire job records after their retention window. TTL deletion is asynchronous and is not an exact-time guarantee.


## Notifications status

This worker does not yet send remote FCM/Web Push notifications. The app's existing local notification code is only able to notify when the app/browser runtime is available to schedule the notification. Remote push requires device/browser token enrollment, a Firebase Cloud Messaging configuration, and token refresh/revocation handling. Do not claim push notification delivery until those are configured and tested.
