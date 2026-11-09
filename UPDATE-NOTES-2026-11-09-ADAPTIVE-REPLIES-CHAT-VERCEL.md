# Update 2026-11-09: adaptive replies, chat text, Vercel projects

## Agents (server/engineering-protocol.js, response-styles.js, app.js)
- Replaced the fixed "show understanding, then reasoning, then conclusion" flow with RESPONSE SHAPE rules: the request decides the format. No forced "I understand / risk / suggestions / how would you like to continue" template.
- New WRITING_CRAFT_RULES (articles, letters, emails, proposals, cover letters, reports, speeches, stories): finished piece first, correct conventions, placeholders instead of invented facts.
- New response styles: letter, proposal, article, list.
- Requests like "put a list in the text box like ChatGPT" are treated as formatting requests for the reply; agents no longer refuse them.
- New `general` protocol mode (about 4k characters instead of about 12.6k). Non-technical chat uses it; technical requests (code, errors, repos, deploys) still get the full engineering protocols. Shorter prompt = faster first token.

## Chat text (src/ui/App.jsx Markdown, src/ui/pothub-ui.css)
- Markdown renderer rewritten: real h1 to h4 with distinct sizes, ordered and nested lists, tables, blockquotes, horizontal rules, italic/strike.
- Copy/selection highlight stays inside the text: bubbles fit their text, spacer line breaks removed, action buttons and avatars are not selectable.

## Vercel (src/ui/vercel/ImportTab.jsx, VercelBackendWorkspace.jsx)
- Removed every "Import on Vercel" / "Import new on Vercel" / "Import" button and the GitHub-import section.
- The Projects tab reads the projects on the connected Vercel account; each card shows its Vercel domain, linked repo and a checkbox that drives Variables, Logs and AI backend. Refreshes when you return to the app.

## Chat
- Backend / Direct API switch added at the top of the provider picker next to the chat box.

## Tests
- Updated 5 assertions that pinned the old wording or the removed import UI. No test that passed before fails now (19 failures remain that also fail on the original zip because node_modules is not included).
