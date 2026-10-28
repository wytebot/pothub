# Use your agent

## Current support
The in-app BYOK path currently supports Google Gemini API keys. Each row is a key/model pair. Add multiple pairs to test multiple routes; the test endpoint runs a tiny `POTHUB_OK` request and ranks successful combinations by observed latency. Diagnosis, repair proposal and file-generation requests use the configured list in order, falling back to the next key/model after provider failure.

When **Use your agent** is on, the API does not fall back to Pothub's own configured AI provider. If all supplied keys fail, the operation fails and the existing reserve/refund flow returns the reserved credits. Operation credits remain applicable for Pothub's service workflow; do not describe these as provider AI charges.

## Key handling
- Keys are held in `sessionStorage`, not IndexedDB, localStorage, Supabase, or Pothub backups.
- Keys are transmitted to the configured API only for the test and operation requests. The API parses them in memory and does not write them to storage.
- The API does not log the request headers or test request body. Hosting/platform-level request capture must also be configured not to retain these values.
- Remove one key or use **Remove all keys** to clear them. Closing the browser session may clear sessionStorage.
- Never paste server service-role credentials or unrelated secrets into this interface.
- Use only providers and keys you trust. Provider terms, quotas and data retention apply.

## Testing and selection
**Test and choose fastest** is a connectivity/latency test, not a guarantee of best reasoning quality. Configure different candidate models for the task, test them, and put the preferred working candidate first. Automatic task-specific model benchmarking remains a future improvement; current routing uses the configured model and key order, with fallback on failure.

## Security limitation
A key must reach a backend for the backend to call Gemini, so it exists in transient request memory. This implementation does not persist it in the application database, but deployment logs, observability middleware, reverse proxies and provider logs must be configured carefully. Do not claim that a key is never transmitted to a server.


## Transport and test limitations

Provider keys are attached only to the transient JSON body of POST operations that need them, rather than HTTP headers, to reduce accidental exposure in proxy/header diagnostics. The server must not log request bodies. The current key test checks text connectivity and latency only; it does not certify image/video capability or compare output quality. Image generation has its own response validation. Video generation remains unsupported until a provider-specific adapter is added.
