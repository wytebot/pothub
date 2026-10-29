# Use your agent

## Current support
The in-app BYOK path currently supports Google Gemini API keys. Each row is a key/model pair. Add multiple pairs to test multiple routes; the test endpoint runs a tiny `POTHUB_OK` request and ranks successful combinations by observed latency. Diagnosis, repair proposal and file-generation requests use the configured list in order, falling back to the next key/model after provider failure.

When **Use your agent** is on, the API does not fall back to Pothub's own configured AI provider. If all supplied keys fail, the operation fails and the existing reserve/refund flow returns the reserved credits. Operation credits remain applicable for Pothub's service workflow; do not describe these as provider AI charges.

## Key handling
- Keys are held in JavaScript memory only, not IndexedDB, localStorage, sessionStorage, or Pothub backups. A page reload clears them.
- Keys are attached to the JSON body of POST test/operation requests only. The API parses them in memory and does not write them to storage.
- Application code redacts provider errors and does not intentionally log request bodies. Hosting/platform-level request capture must also be configured not to retain these values.
- Remove one key or use **Remove all keys** to clear them. Secret Mode can additionally lock access while the app is backgrounded.
- Never paste server service-role credentials or unrelated secrets into this interface.
- Use only providers and keys you trust. Provider terms, quotas and data retention apply.

## Testing and selection
**Test and choose fastest** is a connectivity/latency test, not a guarantee of best reasoning quality. Configure different candidate models for the task, test them, and put the preferred working candidate first. The test endpoint checks text connectivity and latency only. Image generation uses a separate Gemini response adapter and requires a model that returns actual image data. Video generation is not supported by this build. Task-specific routing currently supports Any task, Diagnosis, Repair proposals, File generation, and Image generation; other task types are intentionally not shown.

## Security limitation
A key must reach a backend for the backend to call Gemini, so it exists in transient request memory. This implementation does not persist it in the application database, but deployment logs, observability middleware, reverse proxies and provider logs must be configured carefully. Do not claim that a key is never transmitted to a server.


## Transport and test limitations

Provider keys are attached only to the transient JSON body of POST operations that need them, rather than HTTP headers, to reduce accidental exposure in proxy/header diagnostics. The server must not log request bodies. The current key test checks text connectivity and latency only; it does not certify image/video capability or compare output quality. Image generation has its own response validation. Video generation remains unsupported until a provider-specific adapter is added.

## Secret Mode storage and limits
- BYO provider keys are held in JavaScript memory only. They are not saved in `localStorage` or `sessionStorage`; a page reload clears them.
- Legacy `pothub_agent_config` and `pothub_use_agent` session-storage values are removed at startup.
- When Secret Mode is enabled, BYO API requests are rejected locally while the runtime gate is locked. The gate relocks when the page/app becomes hidden or the settings modal closes.
- Browser WebAuthn is currently a local device-authenticator gate. There is no server-side WebAuthn challenge/credential verification in this build, so it must not be represented as server-verified identity or a secure vault.
- Native biometric prompts require a successful Capacitor sync and a real-device test. The plugin prompt alone does not encrypt JavaScript memory or protect against a compromised app/device.
- For higher assurance, move provider calls to a trusted backend or implement a native secure-storage design whose decryption key is protected by Android Keystore/biometric-bound cryptographic operations. Never store plaintext provider keys in browser storage.
