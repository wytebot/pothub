# Pothub — text-first AI and developer workspace

Pothub is a free, BYOK (bring-your-own-key) text AI app for chat, writing, research, code, document analysis and GitHub-based development. Pothub does not sell subscriptions or include model credits. Providers may charge for API use.

## Product scope
- Text-only AI. Image/video generation, image/video editing, media studios and media attachments are disabled in the active UI and chat flow.
- Text providers: OpenAI, Google Gemini, Anthropic (Claude), xAI, DeepSeek, Mistral, Groq, OpenRouter and Together AI. Provider keys are encrypted locally (Web Crypto in browsers; secure storage in Capacitor Android). They are sent to the Pothub server only for a background job (see below), never for search or crawl.
- Automatic text-model selection and fallback, streaming, continuation handling, file-aware coding, local file conversion, optional web research and citations.
- Web search and site crawling are available without Pothub subscriptions. Site Tools allows up to five saved URLs.
- Codelab reads repositories and files directly from GitHub, edits in-memory buffers with multi-file tabs, line numbers, indentation, find/replace, line-level diff, staged changes, staged deletions, multi-file commits, branch selection/creation, new files, repository creation and recent commit history. Token is memory-only and is not saved in local storage or sent to Pothub servers.

## Codelab current capabilities and limits

Codelab includes repository listing/creation, recursive file exploration, branch switching/creation, text-file reading/editing, working tabs with in-memory buffers, basic line-numbered editor, tab indentation, auto-indent, keyboard shortcuts (Ctrl/Cmd+S to stage and Ctrl/Cmd+F to open find), find/replace, wrap toggle, line-level diff, staged file changes and staged deletions, batch commits using GitHub Git Data API, and recent commit history. Code can be handed to Pothub chat for AI debugging/review. Repository content is not stored server-side.


The editor is intentionally lightweight to keep the app simple and mobile-friendly. It does not yet include a full Monaco/VS Code editor engine, language servers, semantic syntax highlighting, terminal/build runner, live preview, merge conflict resolution, rename/move, pull-request creation/review, or OAuth GitHub login. The token is a manually entered fine-grained GitHub PAT. Use access restricted to selected repositories with **Contents: read/write** and **Metadata: read**; repository creation needs the corresponding account permission. Disconnect/reload clears token and working buffers. Staged commit failures leave the staged changes available for retry. GitHub branch-protection or permission rules can reject commits; follow the surfaced error message and retry on a permitted branch.

## Web research API
The backend exposes authenticated `/api/search` and `/api/crawl` endpoints only. Search/crawl queries and API keys are not stored in server-side logs. Shared Firestore rate limits are used when Firebase Admin credentials are configured; otherwise the server uses process-local rate limits. Crawl limits are intentionally bounded.

## Install and run

```sh
npm install
npm run dev
npm run build
npm test
```

## Capacitor Android

```sh
npm run build
npx cap add android # only on first setup
npm run android:sync
npx cap open android
```

GitHub Codelab uses GitHub's HTTPS API from the browser/WebView, so it works in the PWA and standalone Capacitor app. It does not need a Pothub GitHub backend.

## Research backend

```sh
cd server
npm install
npm run typecheck
npm test
npm start
```

Set `APP_ORIGIN` and optional `EXTRA_ORIGINS`. Firebase Admin credentials are required to verify Firebase sign-in tokens. When Firestore is available, shared rate limits are stored there; if the Firestore rate-limit transaction fails, the process-local limiter is used. The service verifies Firebase sign-in tokens for search/crawl.

## Build verification note
The source changes were syntax-checked, but a complete install/build/test/Android validation could not be run in this environment because dependency installation timed out and `node_modules` was unavailable. Codelab's GitHub API actions have not been live-tested with a real token. Do not treat this archive as a release-verified APK.

## Codelab 0.7.0 workspace upgrades
- Multi-tab in-memory editing so switching between opened files preserves changes without persistent storage.
- Stage and unstage individual files; stage file deletion; create new files.
- Commit all staged file changes in a single Git commit using GitHub Git Data API (blob/tree/commit/ref flow).
- Line-number gutter, indentation, auto-indent, keyboard stage/find shortcuts, find-next and replace/replace-all, line-wrap toggle.
- Line-level diff for manageable files; bounded fallback for very large comparisons.
- Recent commit history and quick open repository on GitHub.
- Better GitHub error messages for expired token, permissions, rate limits, missing files and validation errors.



## Pothub 0.8.0 quality update

- Coding-focused welcome/sign-in screen with responsive preview-style code card.
- Composer tools consolidated in the attachment dropdown: attach files, deep research, developer mode, create-file prompt and Codelab shortcut.
- File picker accepts all types; supported text/document/archive formats are extracted locally. Binary, encrypted, scanned and unsupported proprietary formats may yield limited text extraction.
- Output format detection now accepts explicitly named arbitrary text-file extensions. It cannot synthesize arbitrary binary formats without a native encoder/compiler.
- Terminal workflow feed shows all agent steps rather than hiding step events.
- Codelab staged file uploads are batched four files at a time with progress; single blobs remain intact because GitHub Git Data API creates whole blobs, not partial file commits.
- Capacitor back behavior returns to the app's root route before exiting.

Verification note: dependency installation timed out in this environment; full build, browser e2e and Android APK checks were not run.

## Codelab 0.9.0 workspace additions


- A browser sandbox terminal provides `help`, `pwd`, `ls`, `cat`, `git status`, `git diff`, `npm run` (script inspection), `preview [file.html]`, `run [file.js]`, `audit`, and `check`.
- JavaScript execution uses a worker inside a sandboxed iframe with a 4-second UI timeout and CSP that blocks outbound connections. The runner has no Node.js APIs, filesystem, package installation, or shell access.
- HTML preview runs in a sandboxed iframe; external assets may load, but the preview cannot access the parent application's origin.
- `audit` performs an offline heuristic scan of opened/staged files for possible hard-coded credentials/private keys, dynamic code execution, DOM injection, shell invocation patterns, HTTP URLs and TODO/FIXME markers.
- `check` runs the local JSON parse checks and audit heuristics. It is not a compiler, test runner, dependency audit, or full security scanner.
- Context-aware AI actions include reviewing opened/staged workspace files and explaining project structure. Source context is clipped to a bounded 48,000-character budget before being sent to the configured model provider; the UI notes when that budget is reached.
- Create Pull Request opens GitHub's PR flow by calling the API directly using the connected token. The target branch must differ from the current branch.

These features are browser-side and do not add a hosted compute requirement or an inference bill for Pothub. BYOK model calls are still paid by the user's configured provider if that provider charges. A full OS shell, npm installs, native compilation, Docker, arbitrary Python/Java/C/C++ runtimes and live development servers are intentionally not emulated; use a local terminal for those tasks until an actual isolated runtime is integrated.

## Website diagnosis and Pro site limit (0.10.0)

Website tools are split into separate hash routes: `#/sites` (configuration), `#/sites/backlinks` (per-configured-site followed-link snippet), `#/sites/diagnosis` (run a crawl), and `#/sites/diagnosis/results` (session-only report). Reports are held in `sessionStorage` and cleared when the browser session ends; site configuration remains in local storage. The generated snippet links to Pothub, uses the configured site label in its title attribute, and omits `rel=nofollow` so it is an ordinary followed link by default. Publishing it on an owned site is not a ranking guarantee and should be transparent.

The website limit is 1 site for Free and 5 sites for Pro. Pro UI eligibility reads signed Firebase custom claims (`premium`, `pothubPro`, `pothubPlan: "pro"`, or `plan: "pro"`). This is a client-side UX limit for locally stored configuration, not a security boundary. An optional `VITE_PREMIUM_URL` can point to a hosted checkout page; the current source has no billing/checkout backend, so payment activation and claim assignment must be configured before selling Pro. Do not put secret checkout credentials in Vite environment variables.

Codelab stays behind the verified GitHub-connect screen. Its token remains in memory, and the workspace component remains mounted while navigating so users don't have to reconnect within the same app session.


## Premium billing

Pothub Premium billing uses a server-created Flutterwave hosted checkout. The server verifies the transaction against Flutterwave before updating the Firebase custom claim and Firestore entitlement. The app never accepts client-reported payment success. Configure billing using `server/.env.example`; secrets must remain server-side. The checkout integration currently uses Flutterwave hosted checkout v3 (`POST /v3/payments`), not the Flutterwave v4 charge APIs. Do not deploy as a v4 integration until the OAuth, payment-method setup and v4 orchestration flow are completed and tested against the merchant account.


## Background jobs

Answers are generated by the Pothub server (`server/src/jobs.ts`), so they finish even if the user closes the app, switches apps or loses signal. The app submits the job (`POST /api/jobs`), follows it (`GET /api/jobs/status`), and on reopening picks up any job still recorded in `localStorage` (`jobs.pending.v1`) and shows the result in the right chat. Users can switch it off in Settings; if the server cannot take a job the app runs it on the device instead.

- The server must be a long-running Node process (the existing `npm start`), not a serverless function, because jobs continue after the HTTP response. Jobs time out after 45 minutes.
- The provider key is held in memory for the one job, never written to Firestore or logs, and cleared when the job ends. Only the result (text) is saved to Firestore (`jobs/{id}`, 48 h) so it survives a restart; a job that was running during a restart is reported as interrupted.
- Add a Firestore TTL policy on `jobs.expiresAt` to delete old results. The existing `firestore.rules` already block all client access; only the server (Admin SDK) reads and writes `jobs/*`.
- A notification can only be shown while the app process is alive; after the app is closed the finished answer is waiting when it is reopened. Web/Android push notifications would need FCM and are not included.
- Providers that block browser requests (CORS) still work for background jobs, because the server makes the call.


### Codelab GitHub OAuth (Vercel functions)

GitHub sign-in and the website tools run as Vercel serverless functions in this repository's `api/` folder, so they use the environment variables of the **Vercel project that hosts the site**. Nothing here needs the separate Node API server. Set these in Vercel (Production and Preview), never with a `VITE_` prefix, then redeploy:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_CALLBACK_URL` — optional. If set, it must be `https://<your-vercel-domain>/api/github/oauth/callback`; if not set, that URL is derived from the site's own address.
- `SITE_VERIFY_SECRET` — optional. Signs website-verification tags; falls back to `GITHUB_CLIENT_SECRET`.

In the GitHub OAuth App settings, set **Authorization callback URL** to `https://<your-vercel-domain>/api/github/oauth/callback`. OAuth state is short-lived and bound to the signed-in Pothub user (Firebase ID token verified in `api/_lib/auth.js`). The access token is returned to the client for this session only and is not stored. Codelab also keeps its personal-access-token fallback. The older `/api/github/oauth/*` routes in `server/` are no longer used by the app.

`VITE_API_URL` must still be the address of the Node API server (search, crawl, background jobs, billing, citations). If it points at the website itself, those calls return a web page and the app now says so.

### Configured websites

Everything for a site lives on one card: add the site, verify ownership with `<meta name="pothub-site-verification" content="pothub-…">` in the home page `<head>` (`/api/sites/verify-token`, `/api/sites/verify`), tick **Allow Pothub to crawl this site**, then run diagnosis (`/api/sites/diagnose`, which re-checks the tag first). Ticking the box also shares short excerpts for citations through the API server (`/api/publishers/crawl`); unticking removes them. Backlink snippet, verification and results sit behind the dots button on each card. The old Backlink snippets, Website diagnosis, Diagnosis results and Crawl & citations pages were removed; their old links open Configured websites.

### Crawl & citations

`Crawl & citations` is a separate tool page from Website diagnosis. It crawls configured public sites for readable pages and keeps a local page inventory. If the publisher explicitly opts in, the crawler stores small text excerpts and page metadata in a shared Firestore publisher index; web research relevance-matches those pages and can include them in the consolidated `SOURCES` control. Citations/referrals are not guaranteed, and domain ownership verification is not implemented yet.


### Codelab workspace additions

Codelab supports repository browsing, folder navigation, file filtering, multi-tab editing, find/replace, diff view, staged changes, commit/push, branch switching and creation, commit history, pull-request creation, offline code audit, workspace checks, a restricted sandbox runner, and HTML preview. Additional workspace actions include creating folders via `.gitkeep`, duplicating files, moving/renaming files, importing text files or ZIP archives, and exporting a bounded ZIP snapshot. Import is capped at 20 MB total and 1 MB per text file; ZIP exports are capped at 20 MB and process up to 250 repository files.

## Publisher index and Premium pricing

Crawl & Citations offers an opt-in shared publisher index. It stores only compact page metadata/excerpts in Firestore (up to 6 pages per domain, 1,200 characters of page text each, 3 publisher domains per account, 12 documents read per search, and 30-day expiry metadata). Search results are relevance-filtered before being added to research citations. Configure Firestore TTL for `publisherSites.expiresAt`, `jobs.expiresAt`, `rateLimits.expiresAt`, and pending `billingTransactions.expiresAt` as described in `BILLING-SETUP.md`; expiration metadata alone is not automatic deletion. Site ownership verification is not yet implemented.

Premium pricing defaults to **$4.99/month** or **$45/year** (annual savings approximately 25%), with manual renewal. Configure `PREMIUM_MONTHLY_AMOUNT`, `PREMIUM_YEARLY_AMOUNT`, and `PREMIUM_CURRENCY` on the server. The Flutterwave merchant account must support the configured currency before live checkout.

## Server-authoritative file-analysis quota

File attachment analysis allowance is enforced by the server using Firebase Authentication and a Firestore transaction. Free users share 20 analyses across devices per rolling five-hour window; Premium users are unlimited (the message attachment picker still allows at most 20 files per message). The client only displays server-reported usage and does not write quota counters locally. Quota records use `expiresAt` and are intended to be TTL-deleted after the allowance window plus retention.

Enable Firestore TTL for the `fileAnalysisQuota` collection group on field `expiresAt` in Firebase Console (Firestore TTL). TTL deletion is asynchronous. The app fails closed when the quota service cannot be reached: file analysis cannot be submitted until allowance is verified.

## Guest/public app access

The root workspace renders for signed-out visitors with sign-in in the top bar. Protected tools remain behind authentication. The static HTML shell contains basic product descriptions, metadata, and structured SoftwareApplication data so non-JavaScript crawlers have a limited public introduction.
