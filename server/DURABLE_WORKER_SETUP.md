# Pothub durable background worker

Background requests now enter Firestore as `queued` jobs. The API encrypts the provider request payload with AES-256-GCM before persisting it; the provider key is never stored in plaintext. The separate worker claims jobs transactionally, renews its lease, saves streamed output every two seconds, and can reclaim jobs after a worker process crashes or its lease expires. Results are retained for up to 30 days; individual jobs have a seven-day processing deadline.


## Required server environment

- `BACKGROUND_JOB_ENCRYPTION_KEY`: a dedicated 32-byte key encoded as base64 or 64 hex characters. Generate with `openssl rand -hex 32`. Keep it stable across all API and worker instances. Losing/rotating it without re-encrypting queued payloads makes queued jobs undecryptable.
- Existing Firebase Admin credentials / application-default credentials with Firestore read-write access.

## Worker deployment

Run a long-lived API + worker process on a persistent host, not as a Vercel request handler. `npm start` launches both in one process; alternatively run separate API and worker processes:


```sh
cd server
npm install
npm start
```

Deploy the worker on a process host with a restart policy (e.g. container worker, VM, or managed background service). It may share the same Firestore database with the API. Keep at least one worker running. API deployments can remain serverless; job execution is decoupled.

## Firestore usage

- Job start: reads user's active jobs and queue depth, then writes the encrypted job record.
- Worker: query for queued jobs, transactionally claims a job, heartbeat writes lease/status metadata, and streamed result writes approximately every two seconds.
- Status polling: one document read per poll; the app's polling cadence is currently unchanged.
- Completion: job status/result is saved; encrypted provider payload is cleared.

Configure Firestore TTL on `expiresAt` for the `jobs` collection to expire job records after their 30-day retention window. TTL deletion is asynchronous and is not an exact-time guarantee.


## Remote notifications

Remote completion notifications are wired for web/PWA and Android native builds using Firebase Cloud Messaging. Users opt in from Settings while signed in; the API stores tokens per account and the worker sends a notification when a durable job finishes. Invalid tokens are removed automatically. Turning notifications off unregisters the stored token.

Web/PWA requires `VITE_FIREBASE_VAPID_KEY` from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates, plus the Firebase Admin service account credentials used by Firestore. Android requires `npm install` and `npx cap sync android` to install the Push Notifications plugin, followed by an APK rebuild. Closed-app push must be tested on the deployed configuration before claiming it verified.


## Engineering-agent background mode

Requests explicitly invoking the engineering agent (plan → implement → review) are sent to the durable worker when the server job service is available and no project ZIP is attached. The worker runs all three passes and persists only the reviewed final result; intermediate passes are not exposed in the chat status endpoint. Requests with project ZIPs remain on-device because ZIP inspection, patch bundling, and sandbox validation still require the app's local workflow.
