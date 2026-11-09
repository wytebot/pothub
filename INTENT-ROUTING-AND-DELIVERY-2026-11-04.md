# PotHub intent routing and output delivery — 2026-11-04

## What was weak
- `inferRequestedTask` only matched prompts that *started* with an exact command ("generate/create/make… an image"). "I need a logo for my bakery", "Show me a picture of…", "Hey, please draw…", "Paint a sunset" all fell through to the Chat agent, which then told users it cannot make images.
- A media prompt with no matching agent always blocked the user, even when the sentence was ambiguous.
- An attached image plus "animate this" was never recognised; the image→prompt→video chain only ran from a button.
- Nothing recognised a requested output format ("as a PDF / CSV / docx"); the server chat prompt also told the model to say what tool is "missing", which is how the "I can't generate images" replies happened.

## What changed
- `src/lib/request-intent.js`: new `classifyRequest(text, {attachments})` returns `task`, `confidence` (high/medium/low), `reason`, optional `chain:'image-to-video'` and `fileFormat`. Handles polite/filler prefixes, "I need / show me / give me" phrasing, bare art verbs, design-asset shorthand, and guards how-to questions, code, prompt-writing and analysis of existing media. `inferRequestedTask` is kept as a wrapper.
- `src/ui/App.jsx`: `sendMessage` now calls `routeMediaIntent`. High confidence always routes (missing agent → existing add-an-agent popup). Medium confidence routes only if that agent is configured, otherwise it goes to Chat instead of blocking. Attached image + motion request runs the image→prompt→video chain and passes the user's own direction into the video prompt.
- `src/lib/output-files.js` (new): builds `.txt .md .csv .json .html .docx` from the reply (CSV from a table/fence with formula-injection neutralised, JSON validated). PDF reuses the existing PDF writer. After the reply streams in, the file is saved to local attachments and shown with a Download button on the assistant message. If the content cannot honestly be converted (invalid JSON, `.xlsx`, `.zip`) the reply says so instead of faking a file.
- `server/app.js`: `/api/agent/chat/stream` accepts optional `outputFormat`; the system prompt now explains that PotHub routes image/video to the user's own agents, forbids "I can't generate media/files" replies, and asks for clean convertible content when a format is requested.

## Verification
- New `tests/intent-routing-and-delivery.test.mjs` (6 tests) plus the existing `request-intent` tests: 9/9 pass.
- `node --check server/app.js`, TypeScript parse of `App.jsx` and both lib files: 0 diagnostics.
- DOCX output opened successfully with python-docx.
- Full suite before vs after: the same 28 tests fail in both (missing `express` etc. in this sandbox, plus 3 stale source-regex tests that already failed in the uploaded zip). No new failures.
- Not run: `next build`, a live provider request, browser/APK end-to-end.

## Known limits
- Classifier is rule-based English; other languages route to Chat.
- `.xlsx` and `.zip` outputs are not generated yet (CSV is the spreadsheet route).
- Image *editing* of an attached image is not routed (no edit adapter exists).
