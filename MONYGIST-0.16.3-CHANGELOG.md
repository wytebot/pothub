# MonyGist 0.16.3

## Paid feature: Pro Cloud Repair Agent
- Background GitHub repair jobs now require an active Premium entitlement before dispatch from chat. The backend dispatch route validates Firebase premium claims, validates repository/task inputs, rate-limits dispatches, and only then calls GitHub Actions. Free users still receive their coding response and an upgrade explanation.
- The cloud runner performs up to three repair/verification passes before failing.
- Premium feature description added to Billing.

## Notifications
- Successful commits through the shared GitHub commit helper and Codelab trigger completion notifications when notifications are enabled and the app is backgrounded.
- Chat responses continue using existing answer-completion notification flow.

## Privacy and storage
- Chat history remains stored locally in IndexedDB and is intentionally retained until the user deletes it or clears local data.
- Temporary generated artifacts older than 30 days are cleaned at app startup; a cap of 100 saved artifacts is enforced by cleanup.
- No added server-side chat-history storage.

## UX
- Capsule-shaped button treatment added consistently, with exceptions for icon-only and specialist controls.
- Payment activation gets a reduced-motion-aware celebration animation.
- Sign-in failures show a clearer next-step message.
- Keyboard/focus accessibility styles added.

## Important notification limitation
- Local GitHub commits in Codelab and shared commit flows notify when the app is backgrounded. Cloud-agent commits executed in GitHub Actions do not yet send a push callback to the user device; this needs a secure, expiring job-callback registration and is not claimed as completed.

## Verification limitations
- Syntax-transpilation checks are used because dependency installation timed out in this environment.
- Full `npm run build`, typecheck, Vitest, browser, Capacitor APK and live provider/payment integration tests remain unverified.
