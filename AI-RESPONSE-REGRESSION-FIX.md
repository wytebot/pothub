# AI response regression fix

## Verified finding
The registry no longer lists `gemini-3.8-flash`, but saved agent rows can still contain it in `model` or `models`. `agentHeadersForFunction` sends saved model IDs in the request agent configuration, so the obsolete ID can continue to reach the server after the registry was updated. This matches the supplied screenshot's attempt details.

## Changes
- Added a narrow compatibility migration: only saved Gemini model `gemini-3.8-flash` maps to `gemini-2.5-flash`.
- Apply migration before building BYOK request configurations.
- Migrate existing Dexie saved-agent model fields during startup, preserving the encrypted secret and all other agent settings.
- Apply the same normalization server-side to incoming configured agent model IDs, so stale browser/PWA/Capacitor clients don't keep sending the removed ID.
- Added a regression test proving the legacy Gemini model maps to the supported model, while unrelated providers are not rewritten.

## Validation
- `node --check server/app.js`: passed.
- `node --check src/lib/provider-registry.js`: passed.
- `node --test tests/provider-registry.test.mjs`: 5 passed.
- `npm run check`: static release audit passed, but overall test suite did not pass in this environment. 115 tests passed and 17 failed; several test files could not load because dependencies (`express`, `firebase-admin`, `typescript`) are not installed. One source-level assertion also expects the old diagnostic string verbatim. No production build or live provider call was run.

## Deployment/live test needed
Deploy the ZIP, fully close/reopen the installed PWA/APK, open API & Agents, confirm the saved Gemini agent now shows `gemini-2.5-flash`, then run Test and send a short chat prompt. Provider validity still depends on the user's own Gemini API key/account. This change does not add or use a PotHub platform AI key.
