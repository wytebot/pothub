# PotHub 0.5.10 – deeper web research, sources row, no awareness text

This zip is CUMULATIVE: it includes the earlier large-file speed-up (chunking.ts, attachments.ts fix) because workflow.ts carries both. The patch is against the original 0.5.10 upload.

## What was found
- `/api/crawl` fetched at most 5 pages one at a time (7 s each), with `redirect: 'manual'` and a `!r.ok` check, so any site that redirected (http to https, bare domain to www) was silently dropped.
- Extraction removed every `<header>`, `<nav>` and `<footer>` and then all tags: no main-content detection, no dates, no links. Nothing deeper than the search result page was ever read.
- The private-network guard was a hostname regex only (no DNS check, no IPv6, no redirect re-check).
- The client searched once and crawled only 2,800 characters per page.
- `workflow.ts` appended "Searched the web.", "Web search found nothing useful…" and "Web search was not available…" notes to replies, and told the model web results existed even when none were found.
- Sources were only whatever the model chose to cite inline.

## What changed
| File | Change |
|---|---|
| `server/src/crawl.ts` (new) | Parallel crawl on one shared 14 s budget; redirects followed manually with every hop re-checked; DNS-based block of private/loopback/link-local/IPv6-ULA/mapped addresses, non-80/443 ports, credentials; size-capped reads; main/article extraction with published/updated dates; one level deeper (up to 2 relevant same-site links from each of the top 3 pages, scored on the question and update-style paths such as news/blog/releases); RSS/Atom feed read for each site's newest items. |
| `server/src/search.ts` | Old crawler removed. `ddgSearch` takes an optional recency filter (`fresh=d\|w\|m\|y`). |
| `server/src/index.ts` | `/api/search` accepts `fresh`; `/api/crawl` accepts `query` and `depth` and returns `{ pages, updates }` (old fields kept). |
| `server/package.json` | `npm test` now also runs the search and crawl tests. |
| `src/agent/research.ts` (new) | Pure helpers: search variants (a past-month search runs alongside when the question is about something recent), merge/dedupe (max 2 per site), crawl merge, one-source-per-site list, and the results block for the model (page text up to 6,000 characters, followed pages 3,000, whole block capped near 40,000, dates and newest feed items included). |
| `src/agent/search.ts` | `webResearch()` replaces `webSearch()`: searches in parallel, crawls the top 6, returns hits, updates and `sources`. |
| `src/agent/workflow.ts` | The three web-search notes and the allowance note are gone. The model is told about web results only when some were found. Sources travel on the outcome (`sources`) only when web results were used. The fact-check pass now also sees the web evidence, so it does not strike current facts it could not otherwise verify. |
| `src/agent/deliver.ts` | Prompt: prefer the newest information, cite with the 🌐 link, do not write a Sources list. |
| `src/chat/types.ts`, `src/pages/Home.tsx`, `src/ui/Sources.tsx`, `src/styles.css` | New `sources` field on assistant messages (saved with the chat). `Sources` renders each source site as a chip with the web (globe) icon and the site name, as the last thing in the reply; renders nothing without web results. |

## Verified, and not verified
- Ran under Node 22: 10 crawler tests (SSRF, redirects, parallelism, depth, feeds, budget), 2 existing search tests, 12 research tests, 15 chunking tests: all pass. Client tests used a stand-in for `vitest`.
- A real bug was caught by those tests and fixed: feed summaries that arrive as escaped HTML kept their tags.
- Not run: `tsc`, `vite build`, `vitest`, or the new UI in a browser (no `node_modules`, no network here). Not tested against live DuckDuckGo or real sites. The server and app must be deployed together for pages/updates to appear.

## Limits and next steps
- DNS is checked before each fetch, but a hostname that changes its answer between the check and the fetch (DNS rebinding) is not fully closed; pin the resolved IP in the request if the server is exposed to untrusted users.
- Pages that need JavaScript to show their content, or sit behind a login, are still unreadable.
- The 🌐 chip lists every site given to the model, not only those the answer ended up using.
- "Searching the web…" still appears in the live progress log, because every request searches first; it is not added to the reply.
- Free-tier DuckDuckGo scraping can be rate limited; a failed search is now silent in the reply (logged in the progress log only).
