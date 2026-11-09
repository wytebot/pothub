# Runtime agent routing implementation audit — 2026-11-08

## Implemented in this pass

| Requirement | Implementation | Verification |
|---|---|---|
| Detect common provider environment names | `server/runtime-agent-registry.js` recognizes Gemini/Google, OpenAI, Anthropic, Mistral, Groq, DeepSeek, xAI, Cohere, Perplexity, Together, Fireworks, OpenRouter, Hugging Face and supported media providers. | Runtime registry unit tests. |
| Fixed environment-variable contract | `POTHUB_AI_AGENT_MAP` maps `{function, provider, keyEnv, model}`. Legacy `POTHUB_AI_KEY_ENV` and `POTHUB_AI_MODEL_ENV` pointers remain supported. | Explicit-map and legacy-pointer tests. |
| Function assignment from Manage Variables | Per-key function selector and exact model field; saves `POTHUB_AI_AGENT_MAP` to Vercel and stores non-secret mapping metadata for UI restoration. | UI source checks; requires connected Vercel project for live test. |
| Backend/direct mode isolation | `X-Pothub-Provider-Mode: backend` gates runtime environment discovery. The existing backend-only filter excludes direct agents. Direct mode does not include runtime environment candidates. | Existing backend-mode tests plus request wiring inspection. |
| Task-specific provider/model routing | Candidate discovery filters provider capabilities and exact function; explicit maps are authoritative; media tasks do not borrow generic text models. | Runtime registry tests. |
| Secret handling | Runtime endpoint returns provider IDs only; Vercel API list does not return variable values; map stores names/model IDs, not key values. | Runtime metadata tests and source review. |
| Backend-mode operation availability | Function lookup creates a non-secret runtime-agent sentinel when server env supports the requested task and no saved Vercel Backend agent is selected. | UI wiring inspection; requires browser integration test. |
| Engineering prompt protocol | Existing shared protocol still requires repository preflight, diagnosis, plan-before-write, safe changes and evidence-based delivery. | `agent-preflight-and-env-rotation` test. |

## Known gaps / not verified

1. **Live provider credentials are not available in this workspace.** No Gemini/OpenAI/Anthropic/media API call was made, so account access, model entitlement, provider billing, latency and streaming behavior remain unverified.
2. **Vercel project scope matters.** Environment variables in a project different from the PotHub server deployment are not visible to PotHub's `process.env`. The map-save flow automatically writes `POTHUB_RUNTIME_PROJECT_ID`, and runtime requests require the signed-in user's selected project to match it. No cross-project runtime secret reading is attempted.
3. **Model catalogue freshness is not guaranteed.** The map accepts exact model IDs and checks provider/function capability metadata, but does not prove the selected ID is enabled for the account/region. Use each agent's Test action or a live request.
4. **Video provider execution is adapter-specific.** The registry will only expose models from task-specific lists or explicit user model assignments. Each video adapter still needs a live end-to-end account test.
5. **No Vercel redeploy was performed.** Variable and assignment updates become active only after a deployment receives the new environment.
6. **Full project build was not run in this pass.** Dependency installation is absent in the working tree; syntax and focused tests are reported separately below.
7. **Existing wider audit blockers remain.** Payment sandbox verification, Firestore TTL deployment/concurrency, OAuth and Android device flows, DNS pinning/rebinding, PCI review, media delivery size/redirect handling, and full handler-level regression coverage are outside this provider-routing pass. See `OUTSTANDING_BLOCKERS.md` and `IMPLEMENTATION_STATUS.md`.

## Operational setup

1. In the Vercel project hosting PotHub itself, add provider secrets using the conventional names (for example `GEMINI_API_KEY` and `OPENAI_API_KEY`).
2. In Manage Variables, assign each key to its intended function and enter the exact provider model ID.
3. Save assignments, confirm `POTHUB_AI_AGENT_MAP` appears in the variable list, then redeploy that same Vercel project.
4. Switch the app to Vercel Backend mode. Direct API agents are not used in this mode. Explicit code/error requests in Creator chat route to the configured Diagnosis or Fix function; ordinary questions remain on Chat.
5. Verify each function with a low-cost request and inspect Vercel function logs for request ID/provider errors. Never paste secrets into logs or chat.

## Final verification snapshot

- Focused AI provider/intent/mode/engineering suite: 32 passed, 0 failed.
- Focused Termux job/archive/long-command suite: 16 passed, 0 failed (run separately due a process-tree timing race when suites are combined).
- Full `npm test`: 453 passed, 17 failed at module loading out of 470 total, because this working tree has no installed `node_modules` (`express`, `firebase-admin`, `@hapi/iron`, `jszip`, `typescript`). These are not counted as successful tests.
- Server JavaScript syntax checks and JSX/TypeScript parser checks passed.
- Static release audit passed; this is not a substitute for a production build or live provider verification.
