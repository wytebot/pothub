# Flutterwave v4 billing, model errors, duplicate pages, per-file edit switch

- Billing is Flutterwave v4 only (v3 hosted checkout and `server/flutterwave-hosted.js` removed). Flow: /api/billing/checkout creates the order, /api/billing/authorize creates the v4 customer, encrypted card payment method and charge, 3-D Secure redirects return to /?payment=1&reference=..., /api/billing/verify and the webhook confirm against GET /charges/{id}. Needs FLW_CLIENT_ID, FLW_CLIENT_SECRET, FLW_ENCRYPTION_KEY and FLW_MODE=production for live keys.
- Models: failure classifier no longer treats 429 "check billing" as a bad key or 403 "no access to model" as a bad key; `models/` prefixes are stripped.
- Duplicate pages removed: profile-menu Settings/Free tools/Launchpad/Backup, Codelab sidebar "Home", unused Menu.jsx.
- Codelab: each file's code area has an Editing on/off switch (default on, remembered per repo + file). Off = read-only.
