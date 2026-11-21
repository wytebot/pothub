# Pothub text-first BYOK release


- Removed active Image Studio, Video Studio and Creative Editor navigation/pages.
- Chat now routes requests to text models only. Image/video/audio attachments are rejected; document and source-code attachments remain.
- Provider configuration is text-only and limited to OpenAI, Gemini and xAI text-capable providers.
- Removed Pothub subscription and payment UI/client/server processing. BYOK text analysis and attachments no longer have Pothub usage quotas.
- Site Tools now allows five saved sites for everyone.
- Added Codelab: GitHub token connection, repo list/create, file/tree browsing, branch switch/create, file edit/new, commit and AI code-review handoff.
- Replaced payment backend with authenticated search/crawl-only API and optional shared rate limits.
- Improved assistant instructions for thorough explanations, assumptions, practical steps and complete multi-file code deliverables.


## Not release verified

Dependencies could not be installed before the environment timeout. TypeScript/Vite production build, automated tests, Android build and live GitHub actions still require verification. Codelab is a lightweight editor and not a full WyDev port; see README for its limitations.

## 0.9.0 — Codelab workspace quality features
- Added sandbox terminal commands: help, pwd, ls, cat, git status/diff, npm script inspection, HTML preview, isolated JavaScript run, audit and check.
- Added JavaScript worker execution isolated in an iframe with CSP network restrictions and a 4-second UI time limit.
- Added sandboxed HTML preview.
- Added offline static heuristics for credentials, private keys, dynamic eval, DOM injection, shell-risk patterns, HTTP URLs and TODO markers.
- Added local JSON syntax checks and workspace quality summaries.
- Added context-aware AI workspace review and repository explanation actions.
- Added GitHub pull request creation from the selected branch.
- Added responsive terminal and preview styles.

## 0.10.0 — Website diagnosis separation and access polish

- Split website tools into configured websites, backlink snippets, website diagnosis, and session-only diagnosis results routes.
- Added responsive header Tools dropdown and retained sidebar route access.
- Backlink snippets are per configured site, point to Pothub, and omit `rel=nofollow` so they are normal followed links by default.
- Added more detailed crawl-based SEO/content recommendations and a separate report view.
- Configured sites remain local; diagnosis report is session-only.
- Added one-site Free / five-site Pro UI limits. Pro recognition uses signed Firebase custom claims; optional hosted checkout link is `VITE_PREMIUM_URL`. Payment/checkout and claim granting are not implemented in this source.
- Codelab is kept mounted during route navigation so a verified GitHub connection remains available in the current session; editor tools remain hidden until GitHub is connected.
- Updated legal disclosures and environment template.

## 0.11.0 Billing groundwork
- Added Premium billing screen and in-app navigation.
- Added server-authoritative Flutterwave hosted checkout creation, transaction verification, webhook signature checks, idempotent entitlement activation, and renewal extension.
- Added premium duration custom claim and server billing status.
- Added server environment setup documentation and explicit hosted-checkout integration scope.
- Free remains one configured website; Premium permits five while the entitlement is active.

## Debug pass on 0.11.0 (Flutterwave billing)
- Billing.tsx: `await` inside a non-async `.then` callback (broke `tsc` and `vite build`); callback parsing now copes with Flutterwave appending `?status=…` after `?payment=return`; URL cleaned after verification.
- server/billing.ts + SiteTools.tsx: `pothubProUntil` claim was written in milliseconds but read as seconds, so Premium never expired. Claim is now seconds everywhere, and legacy millisecond claims are tolerated.
- local.ts: added missing `an()` and `mergePdfs()` (pdf-lib). readers.ts: added missing `asText()`.
- workflow.ts: removed unused `webRemaining` import (`noUnusedLocals`).
- Icon.tsx: added `search`, `file-text`, `git-branch` icons that Home.tsx uses.
- router.ts: `IntentOptions` accepts `code` so codeWork.test.ts type-checks.

## Offline readiness and resumable server jobs
- Preserved the offline-first PWA shell, static asset cache, IndexedDB chat/project/media storage, and online-wait behavior for direct provider requests.
- Background server jobs now expose a `paused` status while waiting through provider credit exhaustion (402), rate limits (429), transient server errors (5xx), or connection failures.
- Retry backoff is bounded and repeats until recovery or the six-hour job deadline; provider credits can be restored during that window and the job resumes automatically.
- Server job pause reason is persisted with the bounded job result metadata; provider secrets remain memory-only and are never written to Firestore.

## Vercel TypeScript build fixes (2026-11-21)
- Renamed Codelab's commit-history state to `commitHistory` so it no longer shadows the browser History API; GitHub OAuth callback cleanup now uses `window.history.replaceState`.
- Marked the locally generated GitHub tree item type as the literal `blob`, preserving the `TreeItem` union.
- Wrapped optional-string `connect` handlers in click callbacks so React MouseEvent is not passed as a token.
- Removed the unused `useMemo` import from Billing.
- Renamed the workflow streaming callback parameter to `text` with an explicit string annotation.

## Vercel TypeScript fixes and menu sign-out
- Explicitly typed the streaming text callback parameter in the workflow request object.
- Preserved GitHub Codelab commit history state and browser History API calls as separate concepts (`commitHistory` and `window.history`).
- Added literal `blob` types to staged folder markers, copied files, and ZIP/text imports so they remain valid `TreeItem` entries.
- Wrapped GitHub connect callbacks in click handlers to avoid passing React mouse events as optional token arguments.
- Added a Sign out action to the expanded More navigation section; it uses the Firebase/native sign-out helper and closes the mobile drawer after sign-out.

## Chat composer note, GitHub connect and site verification
- Removed the "File allowance is checked securely when you submit files. Sign in to use file analysis." note (and the sign-in state that only fed it) above the chat composer in Home.tsx.
- Codelab "Connect GitHub": the client now accepts the authorization link from the server and checks it points at github.com before redirecting; the server names exactly which GitHub settings are missing (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL, APP_ORIGIN) and requires an https callback URL.
- Website diagnosis now requires ownership verification. Each account gets a signed tag for each site: `<meta name="pothub-site-verification" content="pothub-...">` to paste inside the site's `<head>`. New server routes: GET /api/sites/verify-token, POST /api/sites/verify, POST /api/sites/diagnose (re-checks the tag, then crawls). Sites list shows Verified / Not verified.
- New server setting SITE_VERIFY_SECRET (falls back to GITHUB_CLIENT_SECRET, then FLW_WEBHOOK_HASH). Redeploy the server after setting it.
- Added tests: server/src/siteVerify.test.ts and a tag test in siteDiagnosis.test.ts. Not run against a full install here (no network); run `npm test` and `npm run build` before shipping.
