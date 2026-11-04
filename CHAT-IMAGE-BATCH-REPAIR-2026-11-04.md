# PotHub chat and image batch repair — 2026-11-04

## Changes
- Removed the workspace's missing-agent prompt card and the Creator chat's video-agent upsell card, including the visible “Configure agent” CTA.
- Replaced numbered processing steps, progress track and checklist with one compact status line and spinner. The text fades in/out without exposing a step indicator.
- Added request-specific status labels for chat/file processing and image generation, with stage changes tied to the existing request lifecycle.
- Expanded the Creator chat file picker to accept ZIP, DOCX, XLSX and additional source/config file extensions that the attachment parser already supports.
- Corrected the batch-generation button to display the actual selected image count and corresponding credit cost.
- Ensured image-generation requests send a numeric batch count.
- Allowed active/discovered Gemini image model IDs (including image/Nano Banana naming variants) through the server's saved-agent model filter and image route, while still rejecting text-only Gemini models.
- Made HTTP 422 responses show the server's actual validation/configuration error instead of hiding it behind a generic attachment warning.
- Updated the stale source test to recognize the existing `generateImage(promptOverride)` signature.

## Verification
- `node --check server/app.js`: passed.
- Focused UI-source, provider-registry, and request-intent tests: 11 passed.
- Full `npm test`: attempted, but the unpacked workspace does not include installed `node_modules`; dependency-backed tests fail to load `typescript`, `firebase-admin`, and `express`. The run also exposed unrelated test-suite expectations/dependency failures, so a full green suite and Next.js production build could not be verified in this environment.
