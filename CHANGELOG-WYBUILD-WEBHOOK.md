# PotHub webhook integration changes

- Added `POST /api/billing/wybuild-confirmation` for WyBuild's authenticated server-to-server payment settlements.
- Added timing-safe shared-secret verification (minimum 32 characters).
- Added reference-only lookup for `kh` + 32-hex PotHub orders.
- Added exact reference/status/amount/currency checks and charge-ID binding before credit grant.
- Reuses `addCredits`' idempotent grant marker; webhook retries cannot grant the same purchase twice.
- Added `tests/wybuild-payment-confirmation.test.mjs`.
- Live Flutterwave settlement and deployed environment configuration still require sandbox testing.
