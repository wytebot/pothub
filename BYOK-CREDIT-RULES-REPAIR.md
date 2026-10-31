# BYOK credit rules repair

- BYOK agent diagnosis/repair/chat operations now use a one-credit reservation and commit only when the workflow succeeds; failures release reservations.
- Automatic provider model discovery charges one credit only after the provider successfully returns a non-empty model list. A caller can pass `operationId` to make retries idempotent.
- Provider inference remains performed using the user's supplied provider key; this credit is a PotHub workflow/discovery credit, not payment for provider tokens.
- Creator image generation retains its one-credit successful-operation reservation. Video delivery retains its separate delivery reservation in this pass; verify whether the product should treat submission plus delivery as a single workflow before production, to avoid double charging across those two endpoints.
- Checks passed: `node --check server/app.js`, `node --check server/billing-policy.js`, targeted billing/backup tests (6/6), and static release audit.
- Not certified: full dependency install, Next production build, live provider requests, browser end-to-end, Capacitor export/Android device, and payment/webhook integration.
