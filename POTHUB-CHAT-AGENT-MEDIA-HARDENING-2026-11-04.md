# PotHub chat, agent and media hardening — 2026-11-04

## Changes in this pass

- Fixed the client capability mapping so the `repair` operation uses the configured **Fix generation** agent, not a nonexistent `Fix` agent function.
- Removed cross-function fallback from Chat/Diagnosis/Fix. The browser only prepares agents configured for the requested function; the server only accepts the exact requested task or an explicitly universal `all` agent. Model/key fallback remains bounded within that capability.
- Fixed creator streaming chat to send attachment payloads rather than only saving their metadata in Dexie.
- Added bounded text/PDF/DOCX/XLSX extraction for chat attachments. DOCX extracts document text; XLSX extracts cell values from up to ten worksheets. Extraction is capped at 80,000 characters per file.
- Added image parts to streaming Gemini, OpenAI-compatible and Anthropic-compatible requests, with a clear limit of two images per message. Images are resized/compressed client-side before inclusion.
- Long pasted messages above the direct prompt limit are moved into a paginated PDF attachment; the exact original text is retained separately for the model context. The PDF uses built-in Helvetica/WinAnsi, so glyphs outside the supported character range may be replaced visually; original text sent to the model is preserved.
- Added friendly API error mapping for expired sessions, credits, oversized payloads, rate limits, missing agents and provider failures. Technical detail remains in server logs with a request ID.
- Removed the retired/unsupported `gemini-3.8-flash` from the selectable Gemini catalog and migrate that saved ID to `gemini-3.6-flash`; updated the registry tests to assert the replacement model IDs.
- Added regression tests for capability isolation and attachment transport.

## Important limitations

- The existing signed/resumable upload endpoints support files up to 100 MB, but this pass does not yet wire the chat composer to those endpoints for every binary attachment. The stream request remains intentionally bounded by the Express JSON limit; very large inputs must use the resumable upload flow, and a server-side attachment-reference reader is still needed before arbitrary uploaded binaries can be fed to every provider.
- The long-text PDF is a composer convenience, not a substitute for a full Unicode PDF renderer.
- No full UI/browser/APK end-to-end run was possible in this environment. This pass does not certify every requested gesture, video provider lifecycle, Android download type, OAuth flow, payment flow or repository commit path.
- `package-lock.json` is absent. Dependency installation was not completed in this environment, so `npm ci`, `next build`, Capacitor export and Android build remain unverified.

## Verification performed

- `node --check server/app.js` — passed.
- `node --check server/lib.js` — passed.
- TypeScript parser diagnostics for `src/ui/App.jsx` and `src/lib/provider-registry.js` — 0 diagnostics.
- `node scripts/release-audit.mjs` — passed (static audit only).
- Targeted Node tests — 27/27 passed across agent policy/routing, path policy, scope claims, provider capabilities/params/registry, chat auto-follow/quality, and the new attachment/capability regressions.
- Full test suite — not verified. Several test files cannot load without dependencies such as `express` and `typescript` installed in the project environment.
