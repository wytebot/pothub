# Premium-feeling BYOK features added in this pass

- Repository rules discovery: developer chat loads root `rules.md`, `.fixrules`, or `.cursorrules` when present and injects its content as repository preferences on each request.
- Context mentions: `@file <path>`, `@folder`, `@codebase`, and `@git` chips can be inserted in Edit prompts. Explicit `@file` paths are prioritized in repository context selection. `@folder`, `@codebase`, and `@git` are context directives; this pass does not claim a full semantic index or a separate Git history retrieval engine.
- Plan mode: prefixes the request with instructions to ask up to three clarifying questions before proposing code.
- Push + PR: successful fix commit now attempts to open a PR automatically with a changed-file list and summary. Branch names use `fix/ai-...`. If PR creation fails, the branch remains available and the failure is surfaced in the returned commit object.
- Creator prompt library: prompts can be saved, reused, remixed, and deleted locally on the device. No server database/storage is required for this feature.

Not added in this pass: browser-based Qwen/WebLLM autocomplete (large model download and browser/device compatibility need a dedicated implementation), 10-image batch generation with per-image credit accounting, and a true image-to-prompt-to-video pipeline. These require more than a UI-only toggle to be safe and reliable.

Verification note: server syntax is checked separately. A full Next.js production build, live GitHub OAuth/PR integration, and browser/Capacitor device testing must be run in a dependency-installed environment before production deployment.
