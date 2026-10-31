# PotHub response and action speed optimization

Date: 2026-10-31

## Changes

1. GitHub repository discovery now fetches the authenticated identity and first page concurrently (existing behavior retained), then fetches later pages concurrently in a bounded batch of up to four additional pages. It still validates repository records, deduplicates by GitHub repository ID, and caps discovery at five pages / 500 repositories.
2. Repository metadata is cached in the existing IndexedDB `settings` store under an account-specific key. The last successful list is painted immediately on later visits while the server refresh runs. A failed refresh keeps the cached list unless GitHub explicitly reports that authorization is invalid.
3. The repository refresh request now has a 25-second client deadline consistent with the server's bounded GitHub upstream calls, rather than waiting 55 seconds.
4. Repository context source files are fetched with a bounded concurrency of five rather than serially. File ordering is preserved and individual unreadable files are skipped as before.
5. GitHub repair-branch blob uploads are parallelized for the bounded maximum of eight patch files.
6. Independent startup IndexedDB reads and the pricing/session requests now run concurrently. Device-seed registration no longer blocks app startup.
7. Transient retry behavior for safe GET/HEAD requests is shortened to one retry with a 180ms backoff instead of two retries with longer backoffs. Mutating requests remain non-retried unless they have an idempotency key.
8. Background account synchronization interval is reduced from every 30 seconds to every 60 seconds to avoid competing with foreground user actions; explicit save/visibility/logout synchronization remains intact.

## Safety boundaries

- No AI provider timeouts, credit prices, reservation logic, payment verification, authentication rules, or data retention rules were reduced to make the app appear faster.
- No unbounded fan-out was added: repository discovery is capped at five pages; repository file reads at five concurrent requests; patch blob uploads at eight maximum (the existing request schema limit).
- The local repository cache is account-keyed and stores repository metadata only, not GitHub tokens.
- GitHub/API responses remain non-cacheable at the HTTP layer; this is a local IndexedDB stale-while-refresh UX cache.

## Verification

- `node --check` on server, scripts, tests and API route JavaScript: PASS.
- TypeScript parser check of `src/ui/App.jsx` with JSX preserved: PASS.
- Release static audit: PASS.
- Focused GitHub discovery, request-deadline, billing-policy and agent-mode tests: 13/13 PASS.
- Full test suite: 79 passed, 16 failed to load because dependencies are not installed in this environment (`node_modules` absent; failures include Express/Firebase Admin/TypeScript imports). These are environment-blocked, not counted as passing.
- Production Next.js build and live Vercel/GitHub timing measurements were not run. Do not interpret this change as a measured latency guarantee; network/provider latency remains external.
