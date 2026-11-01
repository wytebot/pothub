# PotHub complete BYOK and Free Tools update

## Included
- Developer and Creator AI routes now require configured user-owned API agents. The server does not silently route to PotHub-funded AI.
- Legacy `pothub` mode values normalize to `own`; the settings UI presents BYOK as the active mode, and the settings endpoint only accepts `own`.
- Added a Free tools page reachable from the sidebar and profile/header menu for both Creator and Developer roles.
- Included local JSON formatter/minifier, JWT decoder (explicitly does not verify signatures), password-strength estimator, regex tester, and web security-header checklist. These tools make no AI/provider calls and do not consume AI credits.
- Added responsive collapsible tool selection on mobile, page entrance animation and animated provider-fallback modal styling.
- Updated AI mode policy tests.

## Important billing boundary
This update disables platform-funded AI model routing and adds tools that do not make AI calls. It does **not** yet complete a global daily-credit ledger migration or remove every existing credit reservation from BYOK workflows (including some image/video delivery and other specialized endpoints). Existing 10 daily credit grants are not newly implemented here. Those require endpoint-by-endpoint migration and tests; this ZIP does not claim those are complete.

## Verification
- `node --check server/app.js`, `server/lib.js`, and `server/agent-mode-policy.js` pass.
- Updated BYOK policy tests: 2 passed.
- Full Next.js production build and Android interaction tests were not run because dependencies are not installed in this environment.
