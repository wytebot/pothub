# Multi-output delivery

File Studio accepts a requested count from 1 to 10. For counts above one, the server requests a structured `files` array, validates safe unique filenames, converts supported PDF/DOCX/XLSX source content into real binary documents, and returns a ZIP bundle plus per-file metadata for preview/history. The ZIP is generated server-side and delivered as base64 with an explicit byte size; the client verifies the decoded byte count before saving.

Project edit proposals can contain up to eight existing repository files. Commit remains an explicit user action, and each path is validated before GitHub branch creation.

## Media formats

A file extension must never be treated as proof of media generation. This File Studio build does not yet have a configured image/video generation adapter that returns actual media bytes. Image/video requests must be routed to a provider that explicitly supports the requested modality and returns media data or a job handle; until that adapter is configured, the interface reports the limitation rather than creating a renamed text file. Media adapters must preserve provider MIME type, decode binary bytes without text conversion, verify sizes, support asynchronous video jobs, and provide browser downloads or Android MediaStore/share handling.

## Creator studio flow (incremental implementation)

The Creator Studio now has an image flow that calls `/api/creator/image`, uses only session-provided Gemini keys assigned to `image` or `all`, requests image modality, extracts actual inline image bytes, returns MIME type and byte size, renders a gallery, saves generated image bytes in device-local IndexedDB, and supports individual downloads plus a ZIP bundle. The current request limit is two images to reduce serverless response-size risk. Failed image requests refund the creator service-credit reservation. Images are not persisted by Pothub's API; the provider's own retention rules still apply.

Video is intentionally capability-gated rather than faked. `/api/creator/video` currently gives a clear unsupported-adapter response and does not charge credits. Before enabling video, implement a provider-specific asynchronous job adapter with operation polling, authenticated media retrieval/proxying, cancellation/timeouts, job-state persistence or recoverable provider operation IDs, and streamed browser/native downloads. Avoid returning huge video base64 payloads from a serverless JSON endpoint.

The Creator Studio UI currently runs under the app's existing authenticated Pothub session; Google sign-in for creator-specific account onboarding remains a separate open integration. Gemini image generation requires a model that actually supports image output; a text-only Gemini model is not sufficient. Add a key in Use Your Agent and assign it to Image generation or Any task.
