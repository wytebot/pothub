# Pothub continuity and GitHub artifact commit
- Generated artifacts now persist in IndexedDB across chat reloads and can be recovered/downloaded from the message card.
- Continuity prompts can retrieve recent relevant chats and locally saved generated artifact text for correction without re-upload.
- Generated file cards now include a GitHub commit picker: select repository, branch, message and commit extracted text files.
- GitHub OAuth token is retained for the current browser session and Codelab auto-reconnects; OAuth state expiry is extended to 30 minutes.
- Binary ZIP contents are skipped by the GitHub text API commit flow; this workflow is not a replacement for Git LFS.
- Run `npm install`, `npm run build`, and `npm test` before deploying. Dependency install could not be completed in this environment.
