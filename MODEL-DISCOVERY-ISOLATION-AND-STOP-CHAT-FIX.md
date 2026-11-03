# PotHub: model discovery isolation and Creator Chat crash fix

## Changes
- Added `stopCreatorChat` to the `WorkspaceSection` context destructuring. `App.jsx` already passes this handler, but the receiving component did not read it, causing `ReferenceError: stopCreatorChat is not defined` when the stop control rendered/ran.
- Changed `POST /api/agent/models` to query only the selected provider's model-list endpoint and apply PotHub's deterministic provider/function filter. It no longer invokes the server-side Gemini documentation assistant to classify model activity. It never runs a chat/agent job and reports zero PotHub credits consumed.
- Changed `GET /api/models/active` to return the local configured catalogue only; it does not invoke the documentation assistant or any AI provider.
- This intentionally stops AI-assisted deprecation classification during discovery. The live provider list is the source of discovered IDs; a listed model can still fail inference if the provider disables it or the key lacks permission. Discovery does not probe models by generating content.
- Agent execution remains separate and uses only the user's explicitly configured agent candidates. Configured fallback model variants may still be tried for actual tasks if the user has saved them.

## Verification
- `node --check server/app.js` passed.
- JSX syntax was not checked with `node --check` because Node does not parse `.jsx` directly. Full dependency install, tests, and Next.js production build have not been run in this environment.
