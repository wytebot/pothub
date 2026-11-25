# Pothub live research, site verification and Codelab fixes

## Required Vercel environment variable
The existing Vercel site-verification function accepts `SITE_VERIFY_SECRET` (preferred) or `GITHUB_CLIENT_SECRET`. Set `SITE_VERIFY_SECRET` to a cryptographically random value of at least 32 characters in the Vercel project (Production, Preview, and Development as needed), then redeploy. The token is signed per user and hostname; never expose the secret in client code.

## Site verification
Configured Sites now has matching server endpoints:
- `GET /api/sites/verify-token?site=...` returns the exact meta tag to place in the live homepage `<head>`.
- `POST /api/sites/verify` safely fetches the public homepage, follows only validated public redirects, and checks the exact tag.
- `POST /api/sites/diagnose` crawls the public site and returns readable pages for diagnosis.

The tag must be present in the deployed homepage response, not only in a local editor buffer. The server refuses private-network destinations and unsupported ports.

## Live research
Added deployed Vercel `/api/search` and `/api/crawl` functions. The browser now routes research calls to those same-site functions instead of sending them to the separately configured API server. The search backend tries DuckDuckGo HTML, its Instant Answer API, Google HTML, and Bing HTML in sequence. Research crawls verified and crawl-enabled configured sites alongside top-ranked search results and includes those pages in the answer's source set. Search/crawl remains dependent on external providers and the deployed server having outbound network access.

## Code presentation and Codelab
Generated Markdown code blocks and the Codelab editor now use a lightweight syntax colorizer. Codelab adds an Editing ON/OFF switch, keeps the toolbar horizontally scrollable, and adjusts the editor/workspace to the device viewport.

## Validation
The project build and test suite were not completed in this environment because dependency installation did not finish before timeout. Run `npm install` then `npm run build` and `npm test` before production deployment.
