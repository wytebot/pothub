# PotHub chat-first rewrite — 2026-11-04

## Implemented in this source pass

- Replaced the multi-step welcome/role chooser with a single Google sign-in entry and one headline.
- Changed the authenticated workspace so the Chat conversation view is the default workspace for both creator and developer capability states.
- Added an agent chip to the chat composer that opens API & Agents.
- Reorganized the primary sidebar into Workspace, Create, Develop, and Preferences groups, retaining entry points for chat, library/history, creator tools, API & Agents, Codelab, build/deploy, app icon/themes, credits, settings, security/backup, and linked accounts.
- Added UI status labels for GitHub/Vercel connectivity and changed the sidebar account label to show the signed-in account rather than claiming the user signed in with GitHub.
- Added reduced-motion-aware welcome and navigation styling.
- Preserved existing repository-scope planner/tool loop, credit reservation and idempotency logic, key vault, URL safety, signed media, lock, payment routes, and Capacitor plugin code rather than replacing those subsystems.

## Important remaining blockers

- This is not a complete implementation of the full specification. The current server's GitHub OAuth callback still creates a GitHub-authenticated session rather than safely linking the GitHub token to the existing Google identity. The new UI does not solve that server-side identity-linking migration. Do not rely on Google+GitHub as one unified account until this is implemented and tested.
- The GitHub connection probe currently reflects whether the current session can use the existing GitHub-backed endpoint; it is not proof that cross-provider linking is implemented.
- Per-thread model override, full message action set, every listed file type and >50 MB browser/APK download tests, all media provider lifecycle paths, and all specified gesture/accessibility/performance requirements are not certified complete.
- No package-lock.json was generated in this environment. `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` timed out; offline generation failed because the npm cache lacked package metadata. The included GitHub Actions lockfile workflow can generate it on a networked runner, but it has not been run here.
- No live OAuth, GitHub/Vercel connection, Flutterwave payment, signed upload, deployed Vercel build, browser visual, or physical Android test was run.

## Verification actually run

- `node --check server/app.js` — passed.
- `node --check server/lib.js` — passed.
- TypeScript parser JSX syntax diagnostics for `src/ui/App.jsx` and `src/ui/WorkspaceSection.jsx` — 0 parse diagnostics.
- `node scripts/release-audit.mjs` — passed; this is a static audit only.
- `node --test tests/path-policy.test.mjs` — 2/2 passed.
- Full `npm run check`, full test suite, `next build`, Capacitor export, and Android debug build — not run. Dependencies are not installed in this environment and dependency resolution timed out.
