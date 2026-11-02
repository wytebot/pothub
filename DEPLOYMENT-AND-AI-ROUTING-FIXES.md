# PotHub deployment and AI-routing fixes

## Changes in this patch
- Moved `arcade-hub.css` and `penalty-shootout.css` imports into `pages/_app.jsx`, resolving the Next.js 14 global CSS build error reported by Vercel.
- Removed a broken error-handler reference in image generation that could throw a `ReferenceError` and mask the actual provider error.
- Added prompt-intent routing for explicit image/video generation prompts so those requests go to the matching configured task agent rather than the generic Chat agent.
- Added clear Creator-side messaging when a task agent is missing and hid API & Agents navigation/configuration from the Creator workspace. Agent configuration remains a Developer task.
- Added a stronger instruction for Chat responses to return code in language-tagged fenced blocks and never claim a ZIP/file was created unless an artifact really exists.
- Enabled mobile keyboard autocorrection/spellcheck and increased prompt composer auto-grow limit to 240px in creator and developer prompt editors.

## Validation limits
- `node --check server/app.js` passed.
- Agent-routing and agent-mode-policy tests passed (7/7).
- Full `npm test` was attempted. Tests that needed installed dependencies failed because dependency installation did not complete in this environment (`express`, `firebase-admin`, and `typescript` were unavailable). The full Next.js/Vercel build was not verified here.
- Deploy this ZIP to a branch first and confirm the Vercel build completes before promoting it to production.
