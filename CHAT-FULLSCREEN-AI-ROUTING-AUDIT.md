# Repository Chat UI and BYOK routing audit

## UI changes
- Repository Edit is an immersive viewport-height chat surface; the header is reduced to a transparent back icon and a subtle repository label.
- Removed the introductory empty-state copy and starter prompts from the chat surface.
- Removed the persistent mentions/plan-mode block. Mentions remain behind the vertical-dots button; the existing two-stage sheet is scrollable and closes when the backdrop is tapped.
- Replaced the Send text label with a send icon.
- Added a robot button that lists the chat/text models saved in PotHub's current agent configuration. This list reflects locally configured models; it does not claim that every model is currently reachable.
- Replaced cycling progress statements with a single truthful status: “Sending your request to the configured agent…”.

## AI route failure fact-check
The screenshot's error was produced by `server/app.js` after all configured BYOK candidates failed or were skipped. Previously, the UI received only a generic message, hiding the actionable reason. The server now includes the last bounded attempt details (for example, model absent from the provider's accessible catalog, provider circuit breaker, quota/auth/endpoint failure) and an explicit statement that PotHub did not silently substitute a platform key/model. The common response sanitizer redacts request keys before returning error text.

The router's behavior remains:
1. Use configured user candidates for BYOK mode.
2. Best-effort check the provider's live model catalog when the provider exposes a supported list endpoint; cache successful catalogs briefly.
3. Skip a configured model absent from that catalog and try the next configured candidate.
4. Attempt configured candidates within the request deadline.
5. Return a diagnostic error if none succeeds. No configured candidates means an explicit setup error, not silent platform fallback.

Important limitations: model catalog listing is not proof that inference permissions, billing/quota, or all request parameters are valid. Provider model APIs differ, and some compatible endpoints may not expose a catalog. A model can therefore appear in the provider's catalog but still fail on inference. See Google's official guidance: https://ai.google.dev/api/models and https://ai.google.dev/gemini-api/docs/troubleshooting; OpenAI's list endpoint: https://developers.openai.com/api/reference/resources/models/methods/list.

## Verification limits
- `node --check server/app.js`: passed.
- `node scripts/pricing-check.mjs`: passed.
- `node scripts/release-audit.mjs`: passed (static audit only).
- Targeted tests `billing-policy`, `backup`, and `critical-regression-source`: 12/12 passed.
- Full Next.js build and live provider/OAuth requests were not run because this extracted ZIP has no `node_modules` and no live credentials.
