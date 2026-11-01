# PotHub compatibility matrix

**Legend:** Source = inspected; Static = automated tests; Live = exercised with real credentials/device. The current archive has not had a production build or live OAuth/provider/payment/device test in this environment.

| Action | Browser | Installed PWA | Capacitor Android | Status |
|---|---|---|---|---|
| GitHub OAuth | One-time ticket; same-origin HttpOnly cookie or opaque bearer session | Same-origin cookie persists across relaunch | Custom-scheme one-time handoff; opaque revocable session | Static checks only; live test required |
| Google OAuth | Firebase redirect + auth-state restoration + same-origin `/__/auth/*` proxy | Same origin and localStorage redirect TTL | Backend OAuth + deep-link return + cold-start URL check | Static checks only; live test required |
| BYOK AI | Explicit user agents only; no platform AI fallback | Same API | Requires `NEXT_PUBLIC_API_BASE` and user-configured agents | Provider live tests required |
| GitHub Codelab | Developer-only; GitHub remains source of truth | Same | Same API origin required | Repository/commit workflows need live test |
| Vercel | Integration remains in source and should be Developer-only | Same | OAuth redirect needs device test | Live OAuth/deploy test required |
| Flutterwave | Hosted checkout + server verification/webhook | Same | Native browser/deep-link/resume handling requires verification | Sandbox and webhook replay required |
| Backup/restore | Dexie + ZIP helpers | Same browser storage | Native storage and picker behavior need device test | ZIP helpers have unit tests; restore transaction needs more tests |
| Service worker | Browser/PWA only; build-stamped shell | Update prompt expected | Registration skipped in native shell | Offline/update live test required |

## Release verification

- Run `npm run check` with dependencies installed and record the complete output.
- Build the browser/PWA and Capacitor export with `NEXT_PUBLIC_API_BASE` set; confirm `out/pdf.worker.mjs` exists.
- Test Google redirect with Firebase Authorized Domains and the OAuth redirect URI `https://<host>/__/auth/handler`.
- Test GitHub OAuth, cookie session, cross-origin bearer session, native cold-start deep link and logout revocation.
- Test real BYOK model catalogs and all supported image/video providers against current official provider APIs. Curated IDs are not a substitute for live account testing.
- Test concurrent credit reservations and Flutterwave webhook/verify races against staging Firestore and payment sandbox.
- Test 320px layout, safe areas, keyboard overlap, 44px touch targets, device file/ZIP upload, IME composition, Android back priority, offline shell and service-worker update prompt on physical devices.

No row should be marked Live without evidence from that environment.
