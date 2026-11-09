# PotHub chat UX update — 2026-11-02

- Replaced looping progress-step animation with a lifecycle-driven step indicator so labels do not imply that backend operations have completed when they have not.
- Added visible workflow steps to Creator chat while a request is active: request check, context/attachment preparation, response generation, and chat-history save.
- Made the Creator chat message textarea grow with content to 160px and then scroll internally. Applied the same bounded auto-grow behavior to repository chat.
- Expanded Creator and repository-chat attachments to accept common code/text documents in addition to images and PDFs; extracted text remains capped and images are compressed before sending. Repository chat forwards extracted file content and image data to its configured model route, and displays attached filenames in the transcript.
- Kept the existing 8-file and 15 MB per-file limits and attachment chips/removal controls.

Validation: JSX syntax transpilation passed with the globally available TypeScript transpiler. Full npm test/build was not run because this extracted ZIP has no `node_modules` installed in the execution environment.
