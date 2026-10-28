# Changelog

## 2026-10-28 — Repair workspace hardening pass
- Added a central pricing module and a repeatable margin-check command, preserving the four requested USD pack prices and operation costs.
- Added automated tests for repository-name rules, CSV parsing, pricing assumptions, bounded prompt length and reserve/refund arithmetic.
- Added browser/APK compatibility matrix, Android device checklist and internal pricing assumptions.
- Improved health endpoint to return degraded status when Supabase is unavailable and to report integration readiness without exposing secrets.
- Added icon asset set and metadata alignment.
- Explicitly documented items that remain unverified or blocked by external accounts/device access; this pass does not claim production certification.

## 2026-10-28 — Mobile navigation and APK checkout
- Enabled the existing Flutterwave v4 checkout path in the standalone Capacitor APK as requested, pending Play Store publication.
- Replaced the mobile bottom navigation with Inbox, Projects, Fix and Me entry points.
- Added a local Inbox view from saved repository findings with tap-through to project evidence.
- Routed legal links through Capacitor Browser on native Android so external legal pages can open outside the WebView.
- This change does not claim live payment verification, native download/share, or device QA; those require configured credentials and Android testing.

## 2026-10-28 — Session-only agent keys
- Added a collapsible-menu Use your agent setting with session-only Gemini key/model entries, add/remove controls, a clear-all action, and provider test/latency ranking.
- Wired diagnosis, repair proposals and file generation to use user-configured keys when enabled; user-agent mode does not silently fall back to Pothub AI, and operation failures retain the existing reserve/refund behaviour.
- Added BYOK security and setup documentation. Production Vite build could not be run because dependencies are not installed in this environment.
