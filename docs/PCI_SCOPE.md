# PotHub hosted checkout and PCI scope

PotHub now uses Flutterwave Standard hosted checkout for credit purchases. The browser collects only the customer's email, name and phone number. PotHub creates a payment link server-side and redirects the customer to Flutterwave. Card number, expiry, CVV, PIN and OTP are entered on Flutterwave-controlled checkout pages and are not sent through PotHub UI, API routes, logs or Firestore.

This design is intended to reduce PotHub's cardholder-data scope because payment card data is handled on Flutterwave's hosted page. Do not claim PCI DSS compliance or SAQ A eligibility solely from this implementation. Confirm the applicable assessment and current Flutterwave integration requirements with Flutterwave/acquirer and a qualified assessor.

Operational controls:

- Keep `FLW_SECRET_KEY` and `FLW_WEBHOOK_SECRET_HASH` server-only. Never place them in `NEXT_PUBLIC_*`, browser storage or client bundles.
- `/api/billing/config` returns only whether hosted checkout is enabled and its flow name; it never returns a card encryption key.
- `/api/billing/authorize` is disabled and returns HTTP 410. The client must use `/api/billing/checkout` and `/api/billing/verify`.
- The server verifies every payment with a fresh Flutterwave GET, binding the transaction to the stored reference, amount, currency and transaction ID before adding credits.
- Credit grants use the order reference as an idempotency key, so repeated redirects/webhooks do not add credits twice.
- Never log webhook bodies, authorization headers, payment payloads or customer data beyond what is required for reconciliation.

The old direct-card encryption flow is no longer the active checkout path. Remove obsolete `FLW_ENCRYPTION_KEY` after confirming no separate legacy service depends on it.
