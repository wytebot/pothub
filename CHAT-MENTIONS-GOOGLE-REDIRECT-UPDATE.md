# Chat UX and Creator sign-in update

- Repository Edit remains a full-screen workspace, with its explanatory intro removed and its back control reduced to an icon-only button.
- Context mentions are now behind a single Mentions button. Choosing a mention opens a second, same-height scrollable sheet with related repository items. Selecting an item inserts it into the prompt and closes the sheets; tapping outside closes the open sheet.
- The repository chat composer remains compact, and the Creator chat composer has a normal-height textarea on mobile and desktop.
- Removed the old inline mention controls from the page; no offline autocomplete UI is present in the source.
- Google session restoration now also honors the persisted preferred role when restoring the Creator workspace, rather than relying only on the server's `authProvider` label.

## Verification

- `node --check server/app.js` passed.
- `node --check server/lib.js` passed.
- `node scripts/pricing-check.mjs` passed.
- `node scripts/release-audit.mjs` passed.
- Targeted Node tests passed: 12/12.
- Full Next.js production build and a live Google OAuth round-trip were not run here, so the redirect fix still needs confirmation in the deployed environment.
