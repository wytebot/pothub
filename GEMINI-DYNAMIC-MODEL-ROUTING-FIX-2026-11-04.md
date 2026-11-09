# PotHub Gemini dynamic model routing hardening — 2026-11-04

## Fixed
- Removed the image-generation server gate that rejected Gemini models unless the model ID contained `image` or `nano-banana`.
- Gemini image discovery now exposes models advertised for `generateContent` (excluding obvious embedding, TTS, and video entries) instead of treating model-name fragments as proof of capability. The Gemini API does not consistently expose image-output capability in model-list metadata, so the actual generation response is authoritative.
- Removed the server-side static `modelsByFunction.Image` filter for Gemini image agents, so newly discovered/user-configured Gemini model IDs reach routing.
- Changed live model catalog membership from a request gate to advisory-only metadata. A model missing from a possibly incomplete or paginated catalog is no longer deferred/rejected solely on that basis.
- The Gemini image-agent test now issues a bounded image-output probe using the user's BYOK key and verifies that actual image bytes are returned. This can incur a small provider charge because it generates a test image.
- Image generation attempts the configured model directly and relies on provider errors/actual output, allowing configured fallback candidates to be tried rather than rejecting by ID before making the request.

## Verification
- `node --check server/app.js` passed.
- `node --check src/lib/provider-registry.js` passed.
- Focused provider registry/model discovery tests: 9/9 passed.
- Additional dynamic-routing regression tests added; run with `node --test tests/gemini-dynamic-routing.test.mjs`.
- No live Gemini API request was made in this environment; live capability still depends on the user's API key, model access, quota, and provider availability.
- Full Next.js production build and complete dependency-backed suite were not run in this pass.
