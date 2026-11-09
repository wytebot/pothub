# PotHub 0.1.5 — persistent creator chat memory

## Changes
- Creator conversations are stored in IndexedDB before the AI request starts, so a failed or interrupted request does not discard the user's message.
- The existing account-scoped cloud sync now receives each conversation/message change immediately and after completion. `chats` and `messages` were already part of the Dexie/cloud-sync tables; no new storage provider or AI summarization call is required.
- Each new chat request now includes a compact, relevance-ranked extract from up to four earlier Creator conversations, plus the recent turns in the active conversation. This gives configured BYOK agents useful continuity without sending the entire archive on every prompt.
- Developer/Codelab repository threads are excluded from Creator memory context.
- Chat history remains newest-first and date-grouped, with a search field, title, and latest-message preview.
- Chat titles and previews are updated as the conversation progresses.

## Deployment
Extract the ZIP at the repository root, preserving paths, then commit and push. Existing users retain their IndexedDB database; no destructive database migration is included.

## Verification limits
The modified JSX was reviewed structurally. This patch has not been run through a full Next.js production build or a live account/cloud-sync test in this environment.
