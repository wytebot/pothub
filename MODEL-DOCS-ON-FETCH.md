# Official model-documentation refresh on Fetch

When an agent's **Fetch** button is clicked, PotHub now requests the provider's live model list and explicitly asks the server-side model lifecycle catalog to refresh its official documentation evidence instead of relying only on the normal 24-hour cache.

## How it works

1. The provider's authenticated model-list endpoint supplies IDs and advertised metadata.
2. The server's documentation checker searches for provider lifecycle/deprecation docs, accepts only registered official documentation hosts, fetches a bounded number of pages, and extracts explicit retired/deprecated status with date context.
3. Known retired/deprecated models are hidden from the returned list; uncertain results fail open and do not erase the list.
4. Refresh is rate-limited and coalesced; the checker retains its last good result on upstream failure.
5. Fetch/model discovery does not consume PotHub credits. The provider may still charge for inference, not model listing.

## Server configuration

Set `MODEL_SEARCH_API_KEY` in Vercel to a Brave Search API key (default) or a Tavily API key. Optionally set `MODEL_SEARCH_PROVIDER=brave` or `tavily`. Without a search key, the provider model list still loads, but lifecycle-document verification is unavailable and the UI reports that explicitly. `MODEL_CATALOG_TTL_HOURS` controls the normal cache lifetime; explicit Fetch can force a refresh, subject to server rate limits.

## Important limitation

This is a deterministic official-document checker, not an LLM making an authoritative availability decision. It intentionally uses conservative parsing to avoid hiding active models based on ambiguous prose. A model appearing in a provider's model-list endpoint is not proof that the user's key has inference permission or quota; use the agent Test action to verify actual access.
