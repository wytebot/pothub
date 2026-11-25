# Durable worker deployment

The supported production architecture is Vercel for the web app and authenticated HTTP API, Firestore for durable job state, and Firebase Functions 2nd gen + Cloud Tasks for background execution. No Railway or permanently running server is required.

Follow the repository-root guide `BACKGROUND-WORKER-VERCEL-FIREBASE.md` for deployment, IAM, secrets, TTL, limits, and smoke tests.

The legacy `npm run worker` / `npm start` process remains available for local development or a dedicated container, but it is not required for the Firebase task-queue deployment. Do not run both the legacy polling worker and Firebase task workers against the same production queue unless you intentionally want competing consumers.
