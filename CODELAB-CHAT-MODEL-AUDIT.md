# Codelab and active-model discovery audit

## Changes in this patch

- Codelab now offers a repository-scoped **AI chat** entry point, plus a per-repository AI shortcut. It opens the existing repository-aware Developer edit chat instead of introducing a second unrelated editor/chat implementation.
- The repository list keeps the GitHub link separate from the AI shortcut and makes workspace limitations progressively disclosed.
- Creator chat history now has a per-conversation delete action. It removes the selected chat record and its messages from local storage and queues account sync; deletion requires confirmation.
- Active-model discovery now returns its result to the Agents UI and distinguishes a verified catalogue from best-effort or unavailable results. A failed search no longer silently looks like a verified current-model list.
- User-facing error text masks common raw JavaScript/network error signatures and gives a friendlier recovery message.

## Active-model feature: what it actually guarantees

The current implementation is a **deprecation filter**, not a universal live model inventory. `GET /api/models/active` begins with the model IDs in `src/lib/provider-registry.js`, then `server/model-catalog.js` uses a configured Brave Search or Tavily API to find official provider documentation and identify retired/deprecated model IDs. The result is cached and fails open: if search is unavailable or evidence is ambiguous, the app keeps the provider's configured list visible. This is safer than removing all options, but it cannot guarantee that every listed model is currently enabled for a particular user's API key, region, account, or provider endpoint.

The key is not sent to the search service; it is used only by the separate provider-specific model-discovery request when the user explicitly asks to fetch models. A model being listed is not proof that a real inference call will succeed. The provider key/model test and actual request remain the authoritative compatibility checks.

## Configuration and verification checklist

1. Set `MODEL_SEARCH_API_KEY` on the server and `MODEL_SEARCH_PROVIDER=brave` or `tavily` if active-model filtering should run. Without a key, the feature is passive and the configured catalogue remains visible.
2. Keep `MODEL_CATALOG_ENABLED` enabled; use `MODEL_CATALOG_TTL_HOURS` to control cache freshness. The default is 24 hours, so provider changes are not necessarily reflected immediately.
3. Review `MODEL_CATALOG_KEEP` before broad `MODEL_CATALOG_HIDE` rules; explicit keep entries should win. Avoid manually hiding a model just because a search snippet mentions it.
4. Use official provider documentation as the source of deprecation evidence. Treat third-party search snippets as discovery only; the server's official-host allowlist and page parser should be tested against false positives and false negatives.
5. In UI copy, say “checked against official deprecation notices” only when `catalogVerified` is true. Otherwise clearly label the list as a fallback/best-effort result.
6. Test a valid key, invalid key, provider outage, search outage, no configured search key, and an account with access restrictions. Ensure manual model ID entry remains available and no failure prevents saving a valid custom model.

## Scope note

Wytelab is a separate Vite application with its own routing, storage, dialogs, GitHub API client and billing/UI assumptions. Copying its entire `src/App.jsx` directly into PotHub would collide with PotHub's Next.js/React shell and duplicate authentication, storage and billing paths. This patch intentionally reuses PotHub's existing GitHub-backed workspace and adds a direct AI-chat route to it rather than importing Wytelab's unrelated billing or app shell. A complete feature-by-feature editor migration still needs a dedicated integration pass and device/API testing; this patch does not claim that every Wytelab toolbar feature has been migrated.
