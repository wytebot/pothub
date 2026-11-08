# Outstanding blocker status

## What is now wired

- GitHub Actions resolves the dependency graph on a networked runner and creates a complete npm lockfile.
- The lockfile workflow validates that file using a clean `npm ci` and uploads it as `pothub-package-lock`.
- The production deployment workflow repeats dependency resolution and clean-install validation, runs the full test suite, runs both the Next.js production build and Capacitor static export, and only then invokes the pinned Vercel CLI deployment.
- Any dependency, test, PDF.js worker, web-build, or Capacitor-build failure now stops deployment.

## What still requires a networked GitHub Actions run

This editing environment cannot resolve `registry.npmjs.org` (`EAI_AGAIN`). Therefore it cannot honestly generate or validate `package-lock.json`, install `express`/`firebase-admin`/`typescript`/`pdfjs-dist`, run the dependency-backed tests, or execute either production build. The missing `pdf.worker.mjs` is provided by the installed `pdfjs-dist` package and is expected to appear after a successful install.

Run **Actions → Generate Pothub npm lockfile → Run workflow**. Download the `pothub-package-lock` artifact and commit `package-lock.json`. Then push; the production workflow will run the full gate and deploy only if every step passes.

No live provider, Flutterwave, Firebase, Vercel, DNS-rebinding lab, or physical Android tests are represented as passed by this patch.


## Product-scope update

Pothub no longer includes the separate Vercel diagnostics OAuth integration. Vercel remains the deployment host. Do not configure a Vercel OAuth callback URL or Vercel OAuth client secrets for this release. Developer diagnostics now use GitHub repository and Actions data directly.

## Persistence and biometric follow-up checks

The latest source pass adds account-partitioned local caching and biometric/PIN fallback hardening. Focused regression tests pass 10/10; the static release audit and JS/JSX syntax checks pass. The full suite currently reports 64 passed and 16 dependency-resolution failures because this environment has no `node_modules`. A fresh `npm install` attempt timed out; `npm run build` therefore stops before Next.js compilation because `pdfjs-dist/legacy/build/pdf.worker.mjs` is not installed. Physical Android biometric and live two-account Firestore tests are still required.

## 2026-11-08 provider-routing completion pass

The newer runtime-agent audit below supersedes the earlier 64/16 snapshot.

### Implemented in this pass

- Server-side provider registry discovers supported environment names and resolves provider/model assignments for Chat, Diagnosis, Fix, Image and Video.
- Manage Variables now supports per-key function selection, exact model IDs, custom OpenAI-compatible/Azure endpoints, write-only secret rotation, and persistence of the non-secret `POTHUB_AI_AGENT_MAP` metadata.
- Saving the map also pins `POTHUB_RUNTIME_PROJECT_ID`; runtime environment candidates are available only when the authenticated account's selected Vercel project matches the deployed PotHub project's ID.
- Backend/direct routing is separated on both client and server. Saved agents are filtered by execution mode; backend runtime credentials are not loaded in Direct API mode.
- Creator chat routes explicit code/log/repository diagnosis requests to Diagnosis and repair requests to Fix; ambiguous questions and general learning remain on Chat. Image/Video continue through the media intent router.
- Runtime Video credentials are resolved server-side for submit/status/result/cancel/resume; no provider secret is sent to the browser.
- Shared engineering prompts now require prompt-to-result reconciliation with IMPLEMENTED/PARTIAL/NOT IMPLEMENTED/BLOCKED statuses.
- Termux long-command execution uses a non-login shell so the selected HOME/workspace path is preserved.

### Verification

- Focused AI provider/intent/mode/engineering tests: **32/32 passed**.
- Termux job, archive, long-command and workspace tests: **16/16 passed** (run separately to avoid a flaky process-tree timing race when combined with the other suites).
- `node --check` on modified server/runtime modules: passed.
- TypeScript JSX parser check (`tsc --allowJs --jsx preserve --noEmit`) on modified UI modules: passed.
- Static release audit: passed; it explicitly does not certify live integrations or production behavior.
- Full `npm test`: **454 passed, 17 blocked/failing because this workspace has no `node_modules`** (471 total). The 17 failures are dependency import failures for `express`, `firebase-admin`, `@hapi/iron`, `jszip` and `typescript`; no full production build could be run here.

### Remaining external verification / not claimed complete

1. Install dependencies on a networked runner (`npm ci` once the lockfile is available) and rerun the complete suite and production build. This is the reason the 17 full-suite cases are not green.
2. Deploy the same Vercel project that hosts PotHub after saving provider keys, `POTHUB_AI_AGENT_MAP` and the automatically pinned `POTHUB_RUNTIME_PROJECT_ID`.
3. Test real provider credentials and exact model entitlements for each configured function. No live Gemini/OpenAI/Anthropic/custom endpoint/image/video API call was made in this workspace.
4. Test browser UI interactions, Vercel OAuth/project selection, environment rotation, Android runtime and video-provider polling against a deployed instance.
5. The prompt router uses high-confidence explicit cues plus repo/code/log evidence for Diagnosis/Fix. It deliberately leaves ambiguous how-to questions on Chat; it does not autonomously mutate a GitHub repository merely because a chat prompt says “fix”. Actual repository writes remain in the dedicated repo/Termux/Codelab workflows with their own preflight and confirmation boundaries.
6. Existing non-AI blockers remain: live Flutterwave/payment webhooks and refunds, Firebase multi-account concurrency/TTL, GitHub OAuth end-to-end, DNS rebinding lab, Android device-specific behavior, and PCI/security review. See the earlier sections of this file and the runtime audit for exact scope.
