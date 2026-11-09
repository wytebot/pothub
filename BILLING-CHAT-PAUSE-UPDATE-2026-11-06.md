# Plans, repo chats, @mentions, pause/resume, response flow (2026-11-06)

## Billing (credits removed)
- Free: 20 agent actions per UTC day. Premium: unlimited. $9.99/month or $99.99/year.
- Trial: first subscription only. Monthly 7 days, yearly 10 days. The customer pays at checkout; the trial days
  come FIRST, then the paid period (30 / 365 days). Returning subscribers get no second trial.
- No automatic renewal. Premium ends at the end of the paid period unless the user pays again; paying early extends
  from the current end date.
- Counted as agent actions: diagnosis, repair, edit chat, planning and Codelab agents. Not counted: plain chat, pull
  requests, repository delete/revert, image/video/file generation. One regex in `server/plans.js` (`AGENT_ACTION`).
- Free-forever accounts (env vars) and Premium are unlimited. Quota is per UTC day (resets 01:00 Lagos time).
- `GET /api/billing/status`; plan orders reuse the verified Flutterwave order flow (`premium-monthly`, `premium-yearly`).
- The credit packs and the old credit RPCs are no longer used for charging. Existing balances are ignored.

## Pause and resume
- Requests that carry an Idempotency-Key (agent jobs) pause instead of failing when offline or at the daily limit,
  and resume with the same key when the connection returns, the allowance resets, or the plan upgrades.
- A banner shows the paused state. Jobs do not survive closing the tab or reloading the page.

## Repo chats
- The repo button opens one persistent chat per repo in the normal chat (stored in IndexedDB, synced with the account).
- Typing `@` in a repo chat lists the repo's files; the contents of mentioned files are attached to the message.
  The chat can only see files that are attached.
- The separate Edit chat was removed.

## Response flow
- Every agent prompt now says: do not open with the conclusion; show understanding, work through evidence, then conclude;
  explicit formats and styles override this.

## Not verified here
- Live Flutterwave payment of a plan order, and the trial dates in a real account.
- Anything that needs firebase-admin/express/Next to run: handlers, Firestore transactions, the built UI. Logic is
  unit-tested with a fake store; client files were syntax-checked with esbuild only.
- 27 tests fail in the sandbox both before and after (missing packages). Some may assert old credit wording.
- Load-speed work is limited to prefetching the chat and Codelab chunks after sign-in. Not measured.
