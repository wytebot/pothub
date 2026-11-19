# Pothub v0.5.6 deployment correction

## Build-log fixes
- `src/agent/attachments.ts`: the compatibility parameter is named `_have` so TypeScript's `noUnusedParameters` does not fail the build.
- `src/models/text.ts`: removed the invalid `i--` in a non-indexed `for (;;)` retry loop. An empty interrupted round now waits for connectivity and retries the same round.
- `src/cloud/sync.ts`: this file is not present in this source tree, and there are no imports referencing it. The previous Vercel commit contained an obsolete cloud-sync module importing a nonexistent `mediaIndex`. When deploying this full source tree, delete that stale file from Git if it remains tracked; do not restore Google Drive sync or add a fake `mediaIndex` export.

## Web research policy
Every text response now attempts a web search before generation, including stable, creative, and explanatory prompts. Existing plan allowances remain in force: Free retains its current daily search limit; Premium remains unlimited. If the Free allowance is exhausted or the search service fails, Pothub explains that fresh web results were unavailable rather than pretending a search succeeded. Search result URLs are passed to the model with instructions to cite them and distinguish verified information from uncertainty.

## Deploy
1. Replace the repository contents with this complete source tree.
2. Confirm the obsolete `src/cloud/sync.ts` is deleted if it exists in the repository.
3. Deploy the frontend and server together so `/api/search` is available.
4. Run `npm install` and `npm run build` in CI/Vercel.
5. Review `npm audit` separately; do not run `npm audit fix --force` without reviewing breaking changes.

## Verification note
The source-level corrections are applied. A full TypeScript/Vite build could not be run in this environment because dependency installation timed out; CI must confirm the final build.
