# PotHub AI Chat, Fallback and Navigation Update

## Changes
- Chat agents can now store multiple model IDs for one encrypted API key. The selected model runs first; additional IDs are tried in the order entered.
- Requests include multiple saved agents for the same function, allowing fallback to other configured API keys when a provider/model fails or is rate-limited.
- Server-side agent config expands model lists and keeps the candidate order, with an eight-candidate safety cap.
- Repository Edit has a strict repository-development scope instruction and a server-side rejection for common clearly unrelated request categories.
- Repository Edit is styled as a full-screen workspace with a dedicated back-to-developer control.
- Mobile navigation includes a back control; browser history and Android hardware back now unwind app navigation instead of immediately exiting. An open edit view or mobile menu is closed first.

## Gemini model refresh note
Developer Chat uses the saved Chat agent records, not a global model selection. To change a saved agent, open API & Agents > Chat > Edit, update its selected model, and save. The new fallback-model field is stored alongside that agent and is tried after the selected model.

## Verification
- `node --check server/app.js`: passed.
- Targeted tests for AI safety, provider health and provider registry: 7 passed.
- TypeScript JSX parser check for App.jsx, AgentsWorkspace.jsx and WorkspaceSection.jsx: passed.
- The complete `npm test` suite could not fully execute because this extracted ZIP does not contain `node_modules`; 16 test files failed to load missing packages such as `express`, `firebase-admin` and `typescript`, while 84 tests passed.
- A full Next.js production build and Android runtime test were not run because dependencies and an Android device/emulator were not available in this environment.
