# Pothub pricing and credit economics

## Current public prices (unchanged)

The checkout remains USD. PotHub also displays indicative NGN equivalents using `POTHUB_USD_NGN_RATE` (default fallback: ₦1,347 per USD, an indicative 31 October 2026 reference). Configure the variable in Vercel Production, Preview and Development to keep displayed naira equivalents aligned with your pricing policy. NGN figures are display-only; they do not alter the Flutterwave order currency or server-verified USD amount.

| Pack | USD price | Indicative NGN at ₦1,347/USD | Credits |
|---|---:|---:|---:|
| Starter | $1.99 | ₦2,681 | 24 |
| Developer | $4.99 | ₦6,722 | 74 |
| Professional | $9.99 | ₦13,457 | 158 |
| Power | $19.99 | ₦26,927 | 324 |

Diagnosis costs 10 credits; repair proposal costs 20. BYO service fees are 2 credits for Developer and 1 for Creator. Developer accounts can choose `Pothub AI` or `My own agent` in Settings; the choice is stored on the server account profile. Pothub AI uses the existing platform usage schedule (10 credits for diagnosis and 20 for repair proposal). Own-agent operations cost 2 credits. Creator configured-agent chat/image operations cost 1 credit. Delivered video charging remains idempotent and is performed only on result delivery. Verified Fix costs 3 credits, charged only after a matching GitHub Actions run is confirmed completed by the server.

## Planning model

Run `npm run pricing:check`. The report prints web and Play channel economics separately, typical/heavy provider token estimates, image/video rate placeholders where applicable, and 0.5×/1×/2× AI-cost sensitivity. The default target gross margin is 60%.

Inputs live in `server/pricing.js`: token rates, image/video rates, processor rates, per-order infrastructure allowance and AI safety factor. They are planning assumptions, not vendor quotations. Actual provider prices, caching/batch discounts, currency conversion, Flutterwave fee caps, tax, chargebacks, refunds and Firestore/storage usage must be reconciled against invoices and production usage. Unknown media costs are reported as `n/a`, not invented.

## Recommendation (analysis only)

Keep the current prices until real per-operation telemetry is available. Diagnosis is the strongest candidate for a cheaper operation because it generally consumes fewer output tokens than repair. Consider a free validation retry for malformed fixes and a first-purchase bonus only after measured high-percentile costs prove the 60% floor remains intact. Do not add a daily free allowance until abuse controls and provider spend ceilings are measured. BYO rescue from a platform failure is fee-waived in the new recovery path.

No user-facing prices or credit pack quantities are changed by this release.

## Credit reservation lifecycle

AI operations reserve credits transactionally using a stable operation reference before the provider call. Successful validated results commit the reservation. Failed provider calls or invalid output release it and append a compensating ledger entry. A generated fix that contains no safe file patch releases its reservation rather than creating a random refund grant. Reservation state is stored in `credit_reservations`; the append-only `credit_ledger` records reserve and release movements with before/after balances. Video delivery reserves only after a result has been fetched and commits on a completed HTTP response; an aborted response releases the reservation.

### Stale reservation reconciliation

`npm run credits:reconcile -- --older-than-minutes=60` is a dry run. It lists reservations still in `reserved` state after the selected age. Inspect operation and delivery logs first: a failed settlement write can leave a successfully delivered operation reserved. Only after confirming that the result was not delivered, an administrator may run `npm run credits:reconcile -- --release --confirm --older-than-minutes=60`. The script is intentionally explicit and capped at 200 rows per invocation. It restores starter-credit attribution and writes a deterministic append-only ledger entry. Configure Firebase Admin credentials in the execution environment; never run this from a public API route.
