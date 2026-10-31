# PotHub repository discovery and mobile picker fix

## Screenshot diagnosis
The mobile stylesheet changed `.repo-select` into a two-column grid (`18px 1fr`) for the search icon and input. The repository custom-select was not assigned to span both columns, so it was placed in the 18px icon column. Its label wrapped character-by-character, producing the narrow vertical strip visible in the supplied screenshot.

## Changes
- Replaced the mixed flex/grid repository row with separate search and full-width picker rows.
- Explicitly made `.repo-picker` and `.repo-picker .custom-select` full width at every breakpoint.
- Kept the picker PotHub-rendered (not a native browser select), with a bounded scroll list, private/public labels, and keyboard-safe empty-list behavior.
- Added repository count, loading, no-match, no-repository, and actionable discovery-error states.
- Added a visible Reconnect GitHub action when access is missing or expired.
- GitHub API now validates the authenticated account ID and OAuth repository scope before discovering repositories. It returns explicit messages for missing scope, account mismatch, and organization SSO denial.
- Repository requests use no-store and paginate up to 1,000 visible repositories.

## Checks performed
- `node --check server/app.js`: PASS
- `node --check server/github-access-policy.js`: PASS
- TypeScript parser check for `App.jsx` and `WorkspaceSection.jsx`: PASS
- Focused GitHub access and pagination tests: 5/5 PASS

## Deployment / external checks still required
- Reconnect GitHub after deploying if the existing OAuth grant lacks the `repo` scope.
- If a private organization repository remains absent, the GitHub organization owner must authorize the OAuth app for that organization or SAML SSO.
- Live OAuth and actual repository list verification require the user's GitHub account and deployed Vercel environment; they were not available in this local check.
