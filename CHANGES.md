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
