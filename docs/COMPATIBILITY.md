# Pothub compatibility matrix

**Verification legend:** Source = inspected; Static = automated source test; Live = exercised with real credentials/device. No production credentials or Android device were available during this update.

| Action | Desktop Chrome/Firefox/Safari | Mobile Chrome/Safari | Installed PWA | Capacitor Android | Status |
|---|---|---|---|---|---|
| GitHub OAuth | Cookie session + state/PKCE | Redirect return | Redirect return | Browser + one-time deep-link ticket | Static only |
| Google OAuth | Firebase redirect + session restore | Redirect result awaited during restoration | Same-origin auth proxy | Native OAuth/deep-link flow | Static only |
| Diagnosis/Fix | Repo/logs, AI output, commit/PR | Responsive React shell | Same shell | Same shell + API origin | Static only |
| BYOK text/vision | Gemini + OpenAI-compatible + Anthropic-compatible protocol families | Same API | Same API | Same API; keys encrypted locally | Static only; provider contract tests required |
| Image/video | Existing Gemini adapters | Same API | Same API | Same API | Gemini-specific; live test required |
| Verified Fix | Polls next Actions run and charges after completion | Same API | Same API | Same API | Static only; Actions repository test required |
| Local workspace library | Dexie Build Health / Prompt Library | Same UI | Same local DB | Same local DB | Static only |
| API key storage | WebCrypto AES-GCM | WebCrypto AES-GCM | WebCrypto AES-GCM | Keystore-backed AES key + AES-GCM data | Static only; device test required |
| API page lock | WebAuthn platform authenticator | WebAuthn if supported | WebAuthn if supported | Native biometric plugin | Partial; browser PIN fallback/security hardening remains |
| Backups | JSON / ZIP, media, prompts | Same | Same | Native save adapter | ZIP unit-tested; round-trip device test required |
| Flutterwave | v4 checkout/verify/webhook | Same | Same | Same API | Static only; sandbox + webhook replay required |
| Offline shell | Service worker static shell | Same | Cached shell | Bundled assets | Static only; offline test required |

## Viewport and interaction checklist

- 320px through ultrawide, portrait and landscape.
- Safe-area top/bottom padding; no modal under the Android gesture bar.
- Soft keyboard does not cover the active field or primary action.
- 44px minimum touch targets for primary actions and navigation.
- Android system back closes the active recovery sheet before leaving the page.
- Reduced-motion preference suppresses decorative animation.
- Service worker never caches `/api` or auth responses; shell invalidation/update prompt remains functional.
- Downloads use browser download behavior or the native platform adapter; test large files and interrupted transfers.

No row is marked Live until exercised with real provider credentials and physical devices.

## Remaining release verification

- [ ] Verify all image provider adapters against real provider accounts; only Gemini image generation is active in this build.
- [ ] Verify all video provider adapters against real provider accounts; only Gemini video generation is active in this build.
- [ ] Verify WebAuthn platform authenticator on supported HTTPS browsers and Capgo biometric prompt on physical Android. Local PBKDF2 passcode fallback is implemented for devices without platform biometrics; verify the five-attempt cooldown and two-minute relock on each target. It is local-device protection, not server-side account authentication.
- [ ] Verify provider health behavior across warm and cold Vercel instances (the breaker is process-local).
- [ ] Verify credit reservation transactions against a staging Firestore project under concurrent requests and webhook/verify races.
- [ ] Verify APK OAuth, media downloads, background relock, offline mode and soft-keyboard behavior on physical devices.

## Image provider adapter status (source wired; live provider verification required)

- Gemini image generation remains supported through the existing Gemini response format.
- OpenAI Images uses the Images API and returns validated base64 image data.
- Stability AI uses the Stable Image multipart endpoint and validates the returned media type and size.
- Black Forest Labs, Replicate and fal use bounded queue polling and approved HTTPS result-host checks. If a job exceeds the bounded request window, the UI receives a clear retry-later error; these adapters should be moved to durable job/status polling before relying on long-running generation under Vercel Hobby limits.
- Image API keys remain in the transient request body and are never written to Firestore or server logs. Failed Pothub delivery releases the BYO service-fee reservation.

Runway, Luma, Kling and Replicate video are selectable through the async media adapter layer. Live provider credentials and physical device delivery still require end-to-end verification before production rollout.

### Latest integration additions

- Creator video supports Gemini, Runway, Luma, Kling and Replicate through provider adapters and owner-bound Firestore media-job records. Jobs are resumable when the app returns online; the BYOK key is re-supplied from the device and is never persisted server-side.
- Agent model selection uses a searchable combobox with keyboard navigation and manual model-ID entry. Live discovery is shown for protocols with supported model-list endpoints; other providers use curated suggestions/manual IDs.
- The main Developer/Creator workspace, API & Agents page, and History/Library pages are lazy route chunks. History is windowed (virtualized) and the searchable model picker is loaded with the Agents chunk. PDF.js, syntax highlighting, and backup ZIP parsing remain deferred until used.
- Browser Fingerprint lock now verifies WebAuthn assertions server-side against a one-time Firestore challenge and stores credential public keys/counters. Browser PIN fallback is scrypt-hashed server-side and attempt-limited. Capacitor uses the native biometric prompt; local passcode fallback remains available when native biometrics are unavailable.

Automated checks do not substitute for live provider credentials, Firebase domain configuration, payment/OAuth sandbox runs, or physical Android device verification.
