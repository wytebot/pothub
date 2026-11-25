# Pothub: Vercel-only API deployment

Pothub's browser and Android clients now call the API on the Pothub Vercel domain. There is no `VITE_API_URL` and no separately hosted Railway API requirement.

## What is hosted on Vercel

- `api/search.js` and `api/crawl.js`: live web search and page crawling.
- `api/[...path].js`: same-origin serverless handler for the remaining API routes implemented in `server/src/index.ts` (file quota, billing status/checkout/verification, site diagnosis, publisher index, notifications, and job endpoints).
- `api/sites`, `api/github`, `api/agent`, and `api/forge` remain first-party Vercel functions. Billing and Software Doctor routes are handled by the catch-all server API.

## Vercel environment variables

Set secrets in **Vercel → Project → Settings → Environment Variables**. Do not put private values in `VITE_` variables.

Required for authenticated server APIs:

- `FIREBASE_SERVICE_ACCOUNT` — Firebase Admin service-account JSON (or base64-encoded JSON), with access to the Pothub Firebase project/Firestore.
- `APP_ORIGIN=https://pothub-self.vercel.app` (use the actual production domain).

Set only when using the corresponding feature:

- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL=https://pothub-self.vercel.app/api/github/oauth/callback`, `GITHUB_WEBHOOK_SECRET`
- `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET`
- `DOCTOR_WEBHOOK_SECRET`
- `FLW_SECRET_KEY`, `FLW_WEBHOOK_HASH`, `PRO_MONTHLY_AMOUNT`, `PRO_PLUS_MONTHLY_AMOUNT`, `PREMIUM_CURRENCY`
- `SITE_VERIFY_SECRET`
- `ENGINE_RUNNER_URL`, `ENGINE_RUNNER_TOKEN` for isolated execution checks (the runner itself remains an external execution service)

Firebase web configuration is embedded in `src/firebase.ts`; no `VITE_FIREBASE_*` variables are required.

## Important Vercel-only limitations

Vercel Functions are request-scoped; they do not run the persistent `server/src/worker.ts` process. Pothub therefore does not advertise durable background execution in this configuration. Normal model requests run from the client while the app is open. The job API endpoints are present, but a persistent worker/queue processor is not started by this deployment.

Large archive execution requests may also exceed the request-body limits of the selected Vercel plan. An isolated runner is still an external compute dependency; Vercel hosts the API entry point, not the sandbox machine.

After adding or changing environment variables, redeploy the Vercel project so the functions receive the new values.
