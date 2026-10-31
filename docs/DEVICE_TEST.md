# Pothub device and release verification

Record device/browser, app version, date, tester and evidence for each check. The automated suite is not a substitute for these tests.

## Authentication
- [ ] GitHub browser OAuth: success, denial, cancellation, bad state and expired state.
- [ ] Google Firebase redirect: success/cancel; ensure redirect result resolves before welcome screen renders.
- [ ] Restore correct role workspace after refresh and cold start; no welcome-screen flash or blank page.
- [ ] Android deep-link return and one-time ticket exchange; test app already running and cold-started.
- [ ] Verify starter-credit grant is idempotent across duplicate redirects/retries.

## Developer workspace and Verified Fix
- [ ] Diagnose logs with and without a local BYOK agent; test platform failure recovery.
- [ ] Add a text agent, fetch models, manually enter an ID, test and save.
- [ ] Confirm custom endpoint disabled by default and private/local URL rejected.
- [ ] Commit a fix to a disposable repository branch; ensure default branch is not modified.
- [ ] Trigger GitHub Actions, click Verify Fix, confirm 3-credit disclosure, pass/fail result and single charge only after run completion.
- [ ] Test no workflow triggered / workflow still running; no credits should be charged.
- [ ] Failure run details can be loaded into diagnosis for a follow-up fix.

## Creator and local library
- [ ] Creator chat, image generation and video generation with supported Gemini models.
- [ ] Prompt Library save/star/reuse/delete; no API request and no credit ledger mutation.
- [ ] Developer Build Health search and copy previous fix; no credit ledger mutation.
- [ ] Prompt Library survives JSON/ZIP backup restore; agents and API keys remain excluded.

## Payments and credit ledger
- [ ] Flutterwave v4 sandbox success, OTP/PIN/AVS, pending, decline, cancellation and webhook replay.
- [ ] Duplicate verify/webhook races grant once.
- [ ] AI failed/empty output is refunded; idempotency key prevents duplicate spend.
- [ ] Verified Fix charge endpoint rejects pending run, wrong branch, wrong repo and duplicate request.
- [ ] Inspect ledger entries for before/after balances, reason, operation ID and nonnegative balance.

## Devices and offline
- [ ] 320px, 360px, 390px, tablet, landscape and ultrawide.
- [ ] Android back closes modal first; soft keyboard and safe areas do not obscure controls.
- [ ] Desktop Chrome/Firefox/Safari; Android Chrome; iOS Safari; installed PWA; Capacitor APK.
- [ ] Offline app launch, update notice, reconnect, native share and MediaStore/download behavior.
- [ ] Native biometric lock only gates API & Agents; background/idle relock; PIN fallback if enabled.
- [ ] Confirm API keys never appear in localStorage/sessionStorage, backups, logs or analytics.

## Release gate
- [ ] `npm run check`
- [ ] `npm run pricing:check`
- [ ] `npm run build`
- [ ] `npm run build:cap`
- [ ] Firebase authorized domains and OAuth redirect URLs verified.
- [ ] Android Capacitor plugins synced; test signed APK on at least one Android 12+ device.

## Additional hardening checks (2026-10-30)

- [ ] Run two concurrent AI requests with the same idempotency key; verify only one reservation debit is recorded.
- [ ] Force provider timeout/5xx and verify reservation state becomes `released`, balance is restored and a release ledger row includes before/after balances.
- [ ] Return malformed structured JSON twice and verify one repair attempt occurs, then no charge remains.
- [ ] Generate an empty/unsafe fix and verify the reservation is released (not a random grant).
- [ ] Abort image/video download mid-response and verify the reservation is released; complete the response and verify it is committed once.
- [ ] Force two consecutive failures for one provider in a warm instance and verify its circuit opens for 60 seconds; verify healthy fallback order remains intact.
- [ ] Enable Fingerprint lock, leave API & Agents idle for two minutes, and verify it relocks; backgrounding should relock immediately.
- [ ] Test each key reveal/edit/delete/test action with the biometric prompt enabled.
- [ ] Confirm `/api/health` contains no Firebase exception details, private paths, credentials or tokens.

- [ ] On a device without biometric/WebAuthn support, enable Fingerprint lock, set a 6–12 digit local passcode, verify correct/incorrect passcodes, and confirm the five-attempt cooldown.
- [ ] On a device with biometrics, confirm native/browser biometric prompts remain the primary unlock path.
- [ ] After a failed Verified Fix run, use Revert fix branch and confirm only the Pothub repair branch changes; the default branch must remain unchanged.
- [ ] Run `npm run credits:reconcile -- --older-than-minutes=60` and verify dry-run output; do not use `--release --confirm` until delivery logs prove the operation was not delivered.

## Image provider verification

For each provider configured under Creator → Agents → Image, run the connection test and then one real generation using a low-cost prompt. Confirm that the generated image opens, downloads/saves to the local attachment library, survives a backup/restore when media is included, and that the Pothub BYO fee is committed once only after the response is delivered. Interrupt a generation before delivery and confirm the reservation is released. Provider-side usage may still be billed by the external provider. For Replicate, fal and Black Forest Labs, verify the queue completes within the bounded request window; a timeout must display retry-later and must not display fake generated output.

## Video provider safety

Only Gemini is selectable for Video in this release. Confirm that no Runway, Luma, Kling or Replicate video option is displayed until a durable provider-neutral job lifecycle is available.

## Lazy syntax highlighting

Open a normal workspace without code blocks and confirm the highlighter chunk is not requested. Open a chat/history item containing a fenced code block and confirm the highlighted output loads; disable the network after the chunk is cached and confirm the plain-text fallback remains readable.

## BYOK media and security verification

- [ ] Add a Runway API key, choose `gen4.5`, submit a 5-second prompt, close/reopen PotHub, and confirm the Firestore-backed job resumes with the same locally stored agent.
- [ ] Repeat with Luma `ray-2`, Kling `kling-3.0`/`kling-4.0`, and a Replicate `owner/model` or explicit `owner/model:version` video model.
- [ ] Confirm a failed provider job has no credit charge; confirm a delivered result has one idempotent charge; interrupt a download and confirm the reservation is released.
- [ ] Confirm provider API keys are absent from Firestore `media_jobs`, server logs, and exported backups.
- [ ] On HTTPS browser, enable Fingerprint lock, register a platform authenticator, set fallback PIN, verify successful/failed assertions, then test PIN fallback after disabling platform authentication.
- [ ] Confirm five incorrect PIN attempts trigger a five-minute server-side pause; verify a successful PIN resets the counter.
- [ ] On Android APK, test native biometric prompt, background relock, app resume, device passcode fallback and API & Agents-only scope.
- [ ] Verify model picker filtering, keyboard navigation, search and manual model entry at 320 px and desktop widths.
- [ ] Populate more than 1,000 local history records and scroll the virtual list without mounting all rows.

## Firestore TTL configuration

Enable Firestore TTL on `media_jobs.ttlAt` and `webauthn_challenges.ttlAt` to remove expired job/challenge documents. The application enforces `expiresAt` on every media-job read even before TTL deletion. In Google Cloud Shell:

```bash
gcloud firestore fields ttls update ttlAt --collection-group=media_jobs --enable-ttl
gcloud firestore fields ttls update ttlAt --collection-group=webauthn_challenges --enable-ttl
```
