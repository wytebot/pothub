# Codelab repository storage policy

- GitHub is the source of truth for repository identity, branches, tree listings, file content, commits, pull requests, reverts, and repository deletion.
- `/api/github/repos` discovers repositories using the signed-in user's GitHub OAuth token. It requests all visible repository affiliations, paginates up to ten pages, deduplicates by GitHub repository ID, and marks responses `Cache-Control: no-store`.
- `/api/github/files` and `/api/github/file` fetch the current tree/file from GitHub at request time and return private, non-cacheable responses. The server does not persist repository file contents as a Codelab mirror.
- Browser storage may contain app preferences or current workspace selection, but must not be used as a durable repository cache. Do not add repository source to IndexedDB, localStorage, Firestore workspace sync, or a server-side vault.
- The API file-inspection route intentionally blocks likely secret files and caps inspection size. Large/binary assets should use GitHub's supported flows rather than being copied into PotHub storage.
- Repository deletion is a destructive GitHub operation, costs one credit via the existing server-side mutation guard, and requires typing the exact repository name. Server-side validation remains authoritative; the client confirmation is only an additional safeguard.

## Validation performed for this update

- `node --check server/app.js` passed.
- `node --test tests/codelab-github-source-of-truth.test.mjs tests/github-repositories.test.mjs` passed (7 tests).
- Full dependency install and production build were not run in this environment because `node_modules` is absent. Deploy only after `npm install`, the full test suite, and `npm run build` pass in CI.
