# Pothub release checklist (manual; not executed in this environment)

Record device/browser, app version, date, tester and evidence for each test.

## Authentication and role separation
- [ ] Browser GitHub OAuth success, denial, cancelled login, mismatched state and expired state.
- [ ] Android GitHub OAuth opens system browser, returns to `ai.pothub.app://auth`, exchanges ticket once, and rejects replay/expiry.
- [ ] Browser Google redirect success/cancel, invalid Firebase ID token, and Google profile + starter credit-ledger creation.
- [ ] Android Google system-browser OAuth returns through the same deep-link handoff.
- [ ] Relaunch restores auth before rendering the workspace; signed-out users never see workspace content.
- [ ] Switching Developer ↔ Creator requires matching provider authentication; sign-out clears session and local agent secrets.

## Developer workflow
- [ ] Repo search and selection, workflow run selection, source file selection and raw-log diagnosis.
- [ ] Diagnosis progress, grouped errors, likely root cause, affected files and saved run history.
- [ ] Fix proposal unified diff per file, explanation, progress, and branch-only commit.
- [ ] Create a PR and verify the link. Confirm the default branch is never directly written.
- [ ] No-agent and failing-default paths display a configure-agent card and never crash.

## Creator and agents
- [ ] Chat markdown/code highlighting, history restore, edit/regenerate, copy/share and attachment previews/downloads.
- [ ] Image/PDF/text attachments validate size/type; included text and image content reaches the model; unsupported PDF extraction is communicated.
- [ ] Image generation stores media as Blob and downloads in browser/APK.
- [ ] Configure multiple agents per function; test each provider, verify default-first fallback and remove/edit behavior.
- [ ] Verify API keys are encrypted at rest, omitted from backups and removed on sign-out.
- [ ] API page biometric lock is off by default, prompts only on that page, relocks on background/leave, and can be disabled only after verification.

## Video and billing
- [ ] Submit a Gemini Omni Flash video job, inspect queued/generating/ready/failed, background/relaunch and verify polling resumes.
- [ ] Cancel while running; verify Pothub stops polling and no credits are charged. Google may finish the background job because the Interactions API cancel operation is not exposed.
- [ ] Deliver MP4/WebM within MIME/size limits; retry result download and confirm delivery charge is idempotent.
- [ ] Simulate failed/timeout/insufficient-credit jobs; verify no charge before delivery and the credit sheet appears when required.
- [ ] Flutterwave v4 sandbox success, OTP/PIN/AVS challenge, pending, decline, cancellation, webhook verification, duplicate-reference replay and exactly-once grant.

## Backup and platforms
- [ ] JSON metadata export/import round-trip; ZIP media export/import round-trip; corrupt/truncated ZIP rejected; counts shown before confirmation.
- [ ] Chrome desktop, iOS Safari, Android Chrome: 360px viewport, keyboard, reduced motion, focus and screen-reader labels.
- [ ] Android APK: offline start, deep-link return, back button, native share, Downloads save, background/resume and force-stop/relaunch.
- [ ] Confirm no localStorage/sessionStorage contains API keys, session tokens or large media blobs.

**Current status:** Automated source tests pass, but no production build or live browser/APK test was possible because npm dependency installation timed out. Do not publish until this checklist is run.
