# Active-model catalogue

Adds a web-search-backed filter so model pickers show only active models.

- `server/model-catalog.js` (new): search API (Brave/Tavily) -> official provider docs only -> extract deprecated/retired model IDs -> cache (memory + Firestore `model_catalog`, 24h TTL, 15 min failure back-off).
- `server/app.js`: `POST /api/agent/models` filters the live list; new free `GET /api/models/active` filters the built-in list. No credits are charged, and neither route is part of the APIs-environment fingerprint lock.
- `src/ui/App.jsx`, `src/ui/AgentsWorkspace.jsx`: picker hides deprecated models and shows "N older models hidden" with a Show/Hide toggle. Manual model-ID entry is unchanged.
- `tests/model-catalog.test.mjs` (new): 12 tests, no network.

Fail-open rules: no key, search error, no official page, would hide every model, or >60% of a list of 8+ models hidden -> normal list is shown.
Env vars: see ENVIRONMENT_VARIABLES.md ("Active-model catalogue").
