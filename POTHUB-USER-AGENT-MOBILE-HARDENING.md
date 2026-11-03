# PotHub user-configured AI and cross-platform hardening

- API & Agents no longer fetches or auto-selects model IDs. Users enter primary and fallback model IDs manually. The existing Test action remains the availability check.
- Model discovery is not triggered by opening API & Agents; model-list APIs are not part of the UI workflow.
- Creator chat stop handler is passed through WorkspaceSection context in this source snapshot.
- Codelab global CSS is imported from pages/_app.jsx only, for Next.js Pages Router compatibility.
- Node engine is pinned to 24.x to match the configured Vercel runtime.
- Rooftop Rush opens in immersive mode with only a close/exit button; leaving returns to workspace.

## Verification limits

Static source assertions and server syntax checks can be performed locally, but a full Next.js production build, browser interaction suite, physical Capacitor device test, provider integration test, and large-file GitHub commit test are not verified by this source edit. Do not treat those as passed. Provider capability limits should be surfaced as actionable status messages; this ZIP does not guarantee every third-party model supports every operation.
