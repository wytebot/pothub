# PotHub agent and provider environment contract

PotHub has two exclusive execution modes. The **Direct API** mode uses provider credentials in the user's encrypted API & Agents vault. The **Vercel Backend** mode uses only Vercel Backend agents and/or provider credentials present in the PotHub server's own runtime environment. The persisted `vercel-backend-mode` switch selects one mode per request. The client sends `X-Pothub-Provider-Mode: backend` only in backend mode; the server does not append runtime environment candidates in direct mode. Direct API agents are never fallback candidates in backend mode, and backend runtime candidates are never fallback candidates in direct mode.

## Canonical environment variable contract

| Variable | Meaning |
|---|---|
| `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc. | Server-only provider credentials. The runtime registry recognizes supported conventional names. |
| `POTHUB_AI_AGENT_MAP` | JSON array mapping each key variable to a function, provider and exact model. This is the authoritative function assignment when present. |
| `POTHUB_RUNTIME_PROJECT_ID` | Non-secret Vercel project ID pin. The Manage Variables page writes it automatically with the map; runtime credentials are only available to a signed-in user whose selected Vercel project matches this ID. |
| `POTHUB_AI_KEY_ENV` | Legacy single-provider pointer: exact environment-variable name containing the provider key. |
| `POTHUB_AI_MODEL_ENV` | Legacy pointer: exact environment-variable name containing the model ID. |
| `POTHUB_AI_FALLBACK_ENV` | Legacy pointer: exact environment-variable name containing comma-separated fallback model IDs. |
| `POTHUB_AI_BACKEND_URL` | Existing OpenAI-compatible custom backend URL. |
| `POTHUB_BACKEND_TOKEN` | Existing generated bearer token for that custom backend. |

The backend must read exact names from `POTHUB_AI_KEY_ENV`, `POTHUB_AI_MODEL_ENV` and `POTHUB_AI_FALLBACK_ENV`; these are pointers, not credentials. Do not guess environment names or return key values to the browser.

## Function map format

`POTHUB_AI_AGENT_MAP` is a JSON array of rows:

```json
[
  {"function":"Chat","provider":"gemini","keyEnv":"GEMINI_API_KEY","model":"gemini-3.6-flash"},
  {"function":"Diagnosis","provider":"openai","keyEnv":"OPENAI_API_KEY","model":"gpt-4.1-mini"},
  {"function":"Image","provider":"openai","keyEnv":"OPENAI_API_KEY","model":"gpt-image-2"},
  {"function":"Chat","provider":"openai-compatible","keyEnv":"CUSTOM_AI_API_KEY","model":"vendor-chat-2026","baseUrl":"https://api.example.ai/v1"}
]
```

Supported functions are `Chat`, `Diagnosis`, `Fix`, `Image` and `Video`. A provider must advertise the capability required by the selected function. Custom OpenAI-compatible and Azure OpenAI entries also require a public HTTPS `baseUrl`; PotHub validates that endpoint and its DNS safety before saving the map and again before provider calls. A single key can be assigned to multiple functions by adding separate rows with the same `keyEnv`. Each row has one exact model ID; do not use a text model for image/video generation. An explicit map is authoritative: an unassigned function stays unavailable instead of silently borrowing another function's key/model. If no explicit map exists, conventional key names are discovered for text functions; media is only enabled when a provider has a declared task-specific model list or an explicit model assignment.

The Manage Variables page lists environment variable names and deployment targets only; Vercel does not return stored secret values. Users can replace a secret through write-only Edit / rotate, assign each recognized provider key to a function, and enter an exact model ID. PotHub stores the non-secret map in the selected Vercel project's `POTHUB_AI_AGENT_MAP` variable and a metadata copy in the linked PotHub account for UI display. The selected project must be the same project that hosts PotHub's serverless runtime for its process environment to see those keys. The server enforces this with `POTHUB_RUNTIME_PROJECT_ID` (or Vercel's `VERCEL_PROJECT_ID` when present); a request cannot turn on global runtime credentials merely by forging the mode header. Redeploy after changing variables or assignments.

## Provider and model isolation

The shared `src/lib/provider-registry.js` remains the capability authority. The server-side `server/runtime-agent-registry.js` reads secrets only from `process.env`, validates the exact variable names and provider/function capability, and returns only the selected task's candidates. The `/api/agent/runtime-env` endpoint returns provider IDs only; it never returns keys or model secrets. Unknown providers, invalid variable names, empty secrets and unsupported capabilities fail closed. Candidate fallback stays within the selected function and selected execution mode.

## Runtime boundary

A Vercel function can inspect only its own process environment. It cannot enumerate or read secrets in a different Vercel project at runtime. Project variable discovery and rotation use the authenticated Vercel API; runtime requests use the deployed function's environment. Environment changes apply to new deployments, not already-running functions.
