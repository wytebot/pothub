# Update 2026-11-08: agent file reading, Vercel project creation, status line

## 1. Agents read the whole repo and every attached file
- Cause: repo chats attached only files that were @mentioned, named or guessed (3 guesses), and the model was told it could read "only the attached files". Device attachments also shrank the repo files allowed (`8 - attachments`). ZIPs kept the first 30 text files at 12,000 characters each, so most of a zipped repo was silently dropped, and ZIPs over 2.5 MB were uploaded and read as raw binary on the server.
- Fix:
  - New read protocol: the agent replies with a ```pothub-read block of real paths from the outline; PotHub fetches the full files and sends them back automatically (up to 6 rounds, 10 files each). The block is hidden from the visible reply.
  - Limits raised: 12 mentioned / 8 guessed / 8 carried files, 80k chars per file, 300k total, files read in parallel, 24 attachments per request (was 8).
  - ZIP attachments now send a complete path listing plus contents ordered source-first within a 240k budget, and say which files did not fit. Large ZIP/DOCX/XLSX/PDF are extracted in the browser instead of being uploaded as binary.
- Files: src/lib/repo-mentions.js, src/lib/repo-files.js, src/ui/App.jsx, src/ui/WorkspaceSection.jsx, server/app.js

## 2. Vercel "no permission to create a project"
- Cause: PotHub signs in with "Sign in with Vercel" (scopes openid/email/profile/offline_access). Vercel keeps API permissions for those tokens in private beta, so POST /v11/projects is refused.
- Fix: a personal Vercel access token can be saved (POST/DELETE /api/vercel/access-token, validated against Vercel, stored encrypted). All Vercel API calls prefer it. When creation is refused the Import tab shows a token field and an "Open in Vercel" import link.
- Files: server/app.js, src/ui/vercel/AccessTokenCard.jsx, src/ui/vercel/ImportTab.jsx, src/ui/pothub-ui.css

## 3. Step timeline replaced by a faded blinking line
- The per-message "Execution sequence" list and the repo step list are gone. While the agent works, one faded line shows the current step and blinks softly; it disappears when the reply is done.
- Files: src/ui/AgentSteps.jsx, src/ui/WorkspaceSection.jsx, src/ui/App.jsx, src/ui/pothub-ui.css

Tests: tests/chat-area-ui.test.mjs and tests/repo-mentions.test.mjs updated and extended. 18 other tests were already failing before this change and are unchanged.
