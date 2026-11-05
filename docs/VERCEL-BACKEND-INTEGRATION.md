# PotHub Vercel Backend integration

## What the Backend Manager configures

The Linked Accounts navigation now includes **Vercel Backend**. It selects a project through the user's Vercel connection, writes provider settings to that project's selected deployment targets, and creates an encrypted local PotHub agent for Chat, Diagnosis, and Fix.

The provider key is sent over TLS to PotHub's server and forwarded to Vercel's project-environment-variable API. PotHub does not save the provider key in Firestore or return it to the browser after the write. Vercel stores it as an encrypted environment variable. PotHub saves only non-secret configuration metadata in the Vercel connection record.

The generated `POTHUB_BACKEND_TOKEN` is a separate credential for requests from PotHub to the user's backend. The client stores this token in the existing encrypted local agent vault; Vercel receives it as an encrypted environment variable. Do not expose it through a `NEXT_PUBLIC_` variable.

## Environment variables written to the selected Vercel project

- The custom provider key variable entered in the page (encrypted).
- The custom model variable entered in the page (plain configuration).
- The custom fallback model variable entered in the page (plain configuration).
- `POTHUB_AI_KEY_ENV`, `POTHUB_AI_MODEL_ENV`, and `POTHUB_AI_FALLBACK_ENV` (names of the variables above).
- `POTHUB_AI_BACKEND_URL` (the configured OpenAI-compatible API base URL).
- `POTHUB_BACKEND_TOKEN` (encrypted backend-to-PotHub bearer credential).

The backend URL must expose `GET /models` and `POST /chat/completions`. The chat route must validate the `Authorization: Bearer <POTHUB_BACKEND_TOKEN>` header using a timing-safe comparison, read the provider key using `process.env[process.env.POTHUB_AI_KEY_ENV]`, read the model using `process.env[process.env.POTHUB_AI_MODEL_ENV]`, and use the fallback list referenced by `POTHUB_AI_FALLBACK_ENV`. It should return the standard OpenAI chat-completions response shape. The backend implementation is provider-specific; this configuration page does not inject application route code into an arbitrary existing project.

## PotHub server setting

Custom provider endpoints are enabled by default so configured backend URLs work without an extra dashboard step. Set `POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS=false` in PotHub's own server environment to disable them. This is separate from the user's selected backend project; all URLs still pass HTTPS, DNS/IP and SSRF checks.

## Vercel permissions and reauthentication

Environment-variable writes require a Vercel Integration with the `project-env-vars` scope. A Sign in with Vercel OAuth connection alone does not guarantee this scope. If the Vercel API returns 403, configure/approve the scope for the integration and reconnect. If Vercel asks for an email verification code, the user completes it on Vercel's own authorization page; PotHub never collects that code.

Vercel environment-variable changes affect new deployments, not already-created deployments. Redeploy the selected project after saving. The manager never reads environment-variable values back.

## Security notes

- Never place provider keys or backend tokens in `NEXT_PUBLIC_*` variables.
- Keep the Vercel access/refresh tokens encrypted server-side in PotHub's existing Vercel connection vault.
- Keep API-key editing behind the same API & Agents biometric/passcode lock when that lock is enabled.
- Direct provider-key agents remain available in API & Agents; the Vercel Backend agent is added as the default route for Chat, Diagnosis, and Fix while preserving existing agents as fallbacks.


## OAuth callback troubleshooting (v0.1.14)

PotHub exposes the callback URL at `GET /api/vercel/redirect-info`. The Vercel Backend page displays and copies this exact value. Register it in the Vercel app's **Manage → Authorization Callback URLs** list. The registered value and the `redirect_uri` sent by PotHub must match exactly, including `https`, hostname, and `/api/vercel/callback`; no trailing slash, query string, or preview hostname. See Vercel's [Sign in with Vercel troubleshooting guide](https://vercel.com/docs/sign-in-with-vercel/troubleshooting).

Callback origin resolution is: `VERCEL_REDIRECT_URI`, `POTHUB_API_ORIGIN`, `VERCEL_PROJECT_PRODUCTION_URL`, legacy `APP_URL`, then the incoming request host. Set `VERCEL_REDIRECT_URI` explicitly if the project has multiple production domains.

## Custom backend URL gate

`POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS` now defaults to enabled in server code. Set it to `false` to disable custom agent URLs. Every custom URL remains subject to HTTPS, DNS/IP pinning, and SSRF protections.

## Environment-variable API permissions

The Sign in with Vercel identity scopes (`openid`, `email`, `profile`, `offline_access`) are not the same as Vercel Integration scopes. Vercel documents `project-env-vars` and `global-project-env-vars` as Integration permissions for environment-variable API operations. If the connected token receives HTTP 403, the current Sign in with Vercel app may not be sufficient for environment-variable writes; use a Vercel Integration configured with the required permission or add the variables in the Vercel dashboard. PotHub must not report a successful save when Vercel rejects the write.

## Backend route requirement

Saving environment variables does not install server route source code into an arbitrary Vercel repository. The selected backend project must already expose authenticated `GET /models` and `POST /chat/completions` routes that read the configured environment variables and validate `POTHUB_BACKEND_TOKEN`. Redeploy after saving variables.
