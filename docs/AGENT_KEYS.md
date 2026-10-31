# API & Agents

Agents are configured separately for Diagnosis, Fix generation, Chat, Image and Video. Multiple candidates can be saved per function; the default is sent first. Keys are AES-GCM encrypted locally and are included in neither JSON nor ZIP backups.

## Shared provider registry

`src/lib/provider-registry.js` is the declarative provider catalogue shared by the browser and server. It describes provider IDs, protocol/auth style, base URL, suggested model IDs, streaming metadata and capability tags. Text/vision-compatible chat routing is implemented for Gemini, OpenAI-compatible APIs and Anthropic-compatible APIs. The compatible protocol adapter covers OpenAI, Mistral, Groq, DeepSeek, xAI, Cohere, Perplexity, Together, Fireworks, OpenRouter, Azure OpenAI and Hugging Face endpoints when their account/endpoint supports the advertised OpenAI-compatible chat API. Provider/model availability and JSON-mode support vary by account and model; enter a model ID manually if discovery is unavailable.

The registry also documents image/video provider capabilities (Stability, Replicate, fal, Black Forest Labs, Runway, Luma and Kling) for future adapter integrations. **Those adapters are not yet wired to production image/video execution.** The shipped image and video routes remain Gemini-specific. Do not select a registry-only media provider and assume generation works.

Live model discovery is implemented for Gemini, Anthropic-compatible and OpenAI-compatible model-list endpoints. For Azure/custom endpoints, the provider may require deployment-specific API versions or route configuration; manual model IDs remain available. A model-list response does not prove the selected model supports every feature.

## Endpoint and key safety

- Custom public HTTPS endpoints require `POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS=true` on the server. Private/local IP literals, localhost, `.local`, metadata hosts, non-HTTPS URLs and URL credentials are rejected.
- Keys are sent in the POST body for the operation/test/model discovery only. They are not written to server persistence or logged intentionally. Provider error strings are scrubbed before being returned.
- Hosting/proxy access logs must not capture request bodies. Never place API keys in query strings, URLs, screenshots or support logs.
- Browser: AES-GCM with WebCrypto; the non-extractable key is held in IndexedDB.
- Capacitor Android: AES-GCM with the key held in Keystore-backed secure storage. Do not clear app storage unless keys have been backed up separately by the user (the backup intentionally excludes keys).
- Sign-out clears local agent secrets. Backups omit `agents` and `settings`.

## Agent health and fallback

Candidates are attempted in the saved order with the default first. Server calls have bounded timeouts. A failed operation is refunded; a platform-AI failure opens the recovery sheet and lets the user add an agent, then retries the interrupted Diagnosis/Fix request. A rescue request waives the BYO service fee. This is not yet a persistent per-provider health-score/circuit-breaker implementation; users should test and remove unhealthy agents.

## API & Agents page lock

The optional lock currently uses the native biometric plugin on Android and WebAuthn platform authentication on HTTPS browsers. It affects only the API & Agents page. The lock does not gate sign-in, app launch, workspaces or navigation elsewhere. A secure, server-verified WebAuthn credential ceremony and a PIN fallback are still required before treating browser lock as a high-assurance security boundary.

## Testing

Test every configured agent with the task it will perform. Model discovery is best-effort. Test text/vision requests separately from image/video generation. Confirm that keys never appear in backup files, request logs, browser-visible errors or analytics. Provider terms, retention and data residency remain the user's responsibility.

## Provider health and output validation

The server maintains a Firestore-backed circuit breaker per provider/model/endpoint, with an in-process cache for warm-instance speed. Two consecutive failures open the breaker for 60 seconds; updates are transactionally merged across Vercel instances. If Firestore is temporarily unavailable, the local cache remains a best-effort fallback. Diagnosis, Fix and Chat responses are validated with strict Zod schemas. An invalid structured response receives one repair attempt; if it remains invalid, the operation fails and its reserved credits are released.

Provider catalog entries marked `implemented: false` are discovery/UI declarations only and must not be treated as usable integrations. At this release, non-Gemini image and non-Gemini video adapters are not production-wired. Do not select them until their provider-specific async job, webhook/polling, output download and settlement adapters are completed and tested.

## Image provider adapters

The Image function exposes Gemini, OpenAI Images, Stability AI, Replicate, fal.ai and Black Forest Labs adapters. Provider selection is capability-filtered. Model IDs may be entered manually when the provider does not expose a compatible model-list endpoint. The server validates media MIME type and size, bounds polling, restricts remote result hosts, redacts provider keys from errors, and charges the Pothub BYO service fee only after the image response is delivered. The external provider may independently bill the key owner according to that provider's terms.

Non-Gemini video adapters are now exposed for Runway, Luma, Kling and Replicate. They require valid provider keys and model IDs; live account-level provider testing is still required before production launch.

## Video BYOK providers and durable jobs

Creator Video agents may use Gemini, Runway, Luma Dream Machine, Kling, or Replicate. Provider keys are submitted only in authenticated HTTPS request bodies. The server stores the provider name, model, opaque upstream task ID, owner ID, state, timestamps, and an expiry timestamp in the `media_jobs` Firestore collection; it never stores the provider key. Each status/result/cancel request re-supplies the key from the user's encrypted local agent store. Jobs use a stable client operation ID so a retried submission returns the same Pothub job instead of starting a duplicate upstream generation. Jobs can therefore resume after a browser refresh or Vercel instance change without persisting credentials. If the user clears local agent keys, they must reconnect the same provider before continuing.

Runway uses the pinned `X-Runway-Version: 2024-11-06` API. Luma uses the Dream Machine video-generation endpoint. Kling uses its current API-key bearer authentication and task query API (not the legacy access-key/secret JWT format). Replicate resolves the selected `owner/model` to its current version before creating an asynchronous prediction; users may also enter `owner/model:version` manually. Provider models and API availability change; model IDs remain editable and provider errors are returned without exposing keys.

Only successful video delivery is charged. A reservation is created immediately before streaming and committed after the HTTP response finishes; aborted/oversized streams release the reservation. The delivery cap defaults to 80 MB and is configurable with `POTHUB_VIDEO_MAX_BYTES` (hard maximum 150 MB).
