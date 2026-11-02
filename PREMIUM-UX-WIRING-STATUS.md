# PotHub premium BYOK feature wiring and UX status

## Existing integrations retained
- Repository rules: server repository context loads root `rules.md`, `.fixrules`, or `.cursorrules` and injects it as project preferences.
- Developer context controls: `@file`, `@folder`, `@codebase`, `@git` are exposed in Edit; selected file references are passed to the repository-aware API.
- Plan mode: asks the connected agent to identify uncertainties and ask up to three clarifying questions before code generation.
- GitHub fix delivery: creates a fix branch, commits proposed files, and attempts PR creation with a summary and changed-file list.
- Creator prompt library: save, reuse/remix, star/delete templates without an AI call; local and account library sections are present.
- Creator image batching currently exposes 1 or 2 images because the API schema/provider response path is bounded to two. Do not advertise ten-image batch generation until provider adapters, idempotency, storage limits, and per-image credit reservations are expanded and tested.

## UX polish in this pass
- Clearer focus states, larger rounded input surfaces, active chat-history selection, calmer panels, and more consistent touch-friendly responsive layouts.
- Improved small-screen wrapping for page headings, composer actions, context controls, and panels.

## Not represented as completed
- Qwen/WebLLM offline tab completion: not wired. It requires a model download, browser capability detection, IndexedDB/cache quota handling, cancellation, and a tested fallback. No model is bundled in this pass.
- Image-to-prompt-to-video chain: not fully wired end-to-end. It needs a defined image-caption operation and explicit per-agent-workflow credit accounting, then persisted chain state and retry behavior.
- Ten-variation image batch: not implemented; current server contract allows only 1–2 images.
- Production Next build, live provider calls, live GitHub PR test, Android APK build, and browser/Android device parity were not verified in this pass.
