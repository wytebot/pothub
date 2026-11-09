# PotHub 0.1.8 update notes

## Included changes
- Creator chat no longer prefixes completed answers with the configured agent/provider name; the assistant answer starts directly.
- Creator chat clears the textarea's expanded inline height and overflow after a send.
- Codelab repository chat clears its expanded textarea height after sending.
- Creator send action is now an icon button inside the expanding composer; redundant footer send button removed.
- Assistant response instructions now request detailed, structured Markdown with appropriate headings, lists, emphasis, links and language-labelled fenced code; no provider/model introduction.
- Markdown rendering supports heading levels 1–6, ordered/unordered lists, blockquotes, bold, italic, underline, strikethrough, inline code and safe HTTP(S) links.
- Rendered code blocks include copy and language-appropriate source download controls.
- Global UI font preference variable now affects the application body, controls and rendered Markdown as well as the editor.
- Package version bumped to 0.1.8.

## Verification performed
- TypeScript JSX transpilation passed for App.jsx, WorkspaceSection.jsx and HighlightedCode.jsx.
- `node --check server/app.js` passed.
- `tests/response-styles.test.mjs`: 2/2 passed.
- A complete test run was attempted; tests requiring server dependencies could not load because dependencies are not installed in this working copy. The full production build was not run.

## Not included / requires API contract
The proposed hybrid API configuration (remote backend URL + secret environment-variable name + server-side model environment-variable resolution + comma-separated fallback models) is not wired in this patch. A generic OpenAI-compatible endpoint expects a real model ID in the `model` field; passing an environment-variable name only works if the user's backend explicitly implements that contract. The next patch needs the remote backend request/response contract or a sample request and response, plus the expected auth-header behavior. Do not send provider secrets to the browser.
