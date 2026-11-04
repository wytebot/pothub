# BYOK agent fallback wiring

## Behavior

- API & Agents saved configurations are the sole source of provider IDs, API keys, endpoints, primary models, and fallback models.
- Each saved agent's primary model is tried before that agent's configured fallback models.
- Candidates are interleaved across configured agents by model preference so the first agent's variants cannot consume the entire eight-attempt request budget before another configured API key is tried.
- Every model remains paired with the exact API key and endpoint saved on its agent. Task assignments are preserved (`chat`, `diagnosis`, `repair`, `image`, or `video`).
- The server also interleaves `models[]` from older clients, so stale PWA payloads do not reintroduce model-first starvation.
- API & Agents' Test action now tests the selected agent's configured model list, records success if any configured model works, and reports which fallback model succeeded.
- Candidate count is capped at eight; duplicate candidates are removed. Invalid/incomplete agents are ignored. There is no platform-key or PotHub-funded fallback.

## Verification

Focused tests: `node --test tests/agent-routing.test.mjs tests/provider-registry.test.mjs tests/byok-only-policy.test.mjs` — 14 passed, 0 failed.

`node --check server/app.js` and `node --check src/lib/agent-routing.js` passed. JSX parsing could not be independently run because `@babel/parser` and project dependencies are not installed in this workspace. Live provider calls, deployed browser/PWA, and Capacitor APK behavior need live testing.
