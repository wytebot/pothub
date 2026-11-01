# PotHub payments through WyBuild's existing Flutterwave webhook

PotHub credit checkout references are `kh` + 32 hexadecimal characters. Flutterwave should continue to call WyBuild's already registered endpoint:

`https://wybuild-black.vercel.app/api/billing/webhook`

Do **not** register PotHub as a second webhook for the same merchant account.

## Configure

1. In WyBuild Vercel, set `POTHUB_PAYMENT_CONFIRM_URL` to `https://YOUR-POTHUB-DOMAIN/api/billing/wybuild-confirmation`.
2. Generate a long random shared secret (at least 32 characters). Set it as `POTHUB_WEBHOOK_SHARED_SECRET` in WyBuild and `WYBUILD_WEBHOOK_SHARED_SECRET` in PotHub. Values must match exactly.
3. Confirm PotHub's existing Flutterwave checkout environment is configured, including `FLW_SECRET_KEY` and its credit-order database. Do not expose server secrets with `NEXT_PUBLIC_`.
4. Deploy both projects. Leave the Flutterwave dashboard webhook URL pointing to WyBuild.
5. Make a small sandbox payment and verify the `credit_orders` row changes to `paid` and the credit ledger records exactly one grant.

## Verification and safety

WyBuild verifies the webhook authentication and retrieves the charge from Flutterwave v4. It forwards only authoritative settlement fields to PotHub over HTTPS. PotHub checks the shared secret, payment reference, exact amount and currency, charge ID, and successful status before applying credits. The credit grant uses the existing idempotent ledger. Pending/processing charges never grant credits. If PotHub is unavailable, WyBuild returns a retryable error so Flutterwave can redeliver.

Live settlement is not verified by source tests; it must be tested in the deployed sandbox before production.
