# MonyGist 0.16.2

## Wired features
- Prompt-aware model routing: quality-ranked providers/models for code, production, security, debugging, audit, verification and research; speed-first for brief/simple requests. Explicit model selections are honored and provider/model fallback remains available.
- Web research reads top results and follows relevant links. It also crawls up to two configured sites only when they are verified and the user enabled **Allow MonyGist to crawl this site**. Configured-site pages are included in evidence and the Sources list.
- AI backend custom environment-variable names are case-sensitive and preserved as typed (valid identifiers, including lower-case and underscore-leading names). Reserved system/platform names remain blocked. Model variables accept comma-separated fallback IDs in priority order.
- Chat platform actions: confirmed GitHub Actions repository-variable writes, workflow dispatch, recent workflow-run listing; confirmed Vercel plain-variable writes and deployment listing. Tagged repair requests automatically bootstrap missing MonyGist workflow/script files without overwriting unrelated files, then dispatch a GitHub-hosted repair job. The cloud runner accepts comma-separated model fallback chains or paired provider/model fallback lists with provider-specific secrets, and performs up to two code/test/build repair iterations before the workflow commits only verified staged changes. GitHub actions require an `@` repo tag; Vercel actions use the last-selected project. Sensitive variable names are rejected.
- Complex generated project ZIP artifacts remain in local artifact storage and do not show a download button. Chat offers a GitHub commit action; the user can select an existing repository or create a new private/public repository, then commit. ZIP commit supports text and common binary assets with bounded concurrency, up to 100 files/50 MB total and 5 MB per binary file.
- Codelab editor additions: JSON formatting, comment/uncomment for supported file types, trailing whitespace cleanup. Sandbox terminal additions: `find`, `grep` (open/staged files only), `wc`, and JSON validation. Terminal remains a browser sandbox, not an OS shell.
- Previous-chat recall triggers cover explicit continuity requests and short follow-up messages; retrieval is bounded to recent chats and a small relevant set.
- Removed the App appearance page/module; automatic/system dark/light mode remains. Icons inherit theme text color and align consistently.
- Billing lists Pro benefits and Free/Pro limits more explicitly.

## Verification status
- JavaScript syntax checks passed for API routes and agent scripts.
- TypeScript/TSX transpile-only syntax checks passed for all 116 source modules.
- Direct Node assertions passed for custom case-sensitive backend variable names and comma-separated model fallback chains.
- Pure helper assertions passed for consented configured-site crawling and prompt-aware model routing.
- Chat action command parsing passed for GitHub variables, Vercel variables, workflow dispatch, workflow-run listing and Vercel deployments.
- Full TypeScript typecheck, production build, and Vitest suites were **not run** because dependency installation timed out and the project has no lockfile in this source archive. Run CI before production deployment.

## Deployment note
Run `npm install`, `npm test`, and `npm run build`. Verify GitHub OAuth/token scopes permit repository variables, workflow dispatch, creating repositories and commit operations. Confirm Vercel project access for environment variables/deployment listing. Use non-sensitive values only for chat variable writes.
