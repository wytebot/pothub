# PotHub pricing and credit economics

## BYOK-only packs

PotHub does not pay for AI inference. Users supply their own provider keys; credits pay only for PotHub infrastructure such as orchestration, generated-file processing, storage, bandwidth, cloud sync and confirmed GitHub operations.

Indicative NGN equivalents use `POTHUB_USD_NGN_RATE` (default ₦1,347/USD; display-only).

| Pack | USD | Indicative NGN | Credits |
|---|---:|---:|---:|
| Starter | $1.99 | ₦2,681 | 200 |
| Developer | $4.99 | ₦6,722 | 600 |
| Professional | $9.99 | ₦13,457 | 1,200 |
| Power | $19.99 | ₦26,927 | 2,400 |

## Credit cost per action

| Action | Previous credits | New credits | Basis |
|---|---:|---:|---|
| Chat / BYOK text orchestration | 1 (Creator), 2 (Developer) | 1 | Small orchestration only; provider tokens are paid directly by the user |
| Repository diagnosis | 10 | 1 | BYOK inference; lightweight request orchestration |
| Repair proposal | 20 | 3 | File/diff validation and proposal delivery |
| File generation | not consistently defined | 3 | Server file generation and delivery |
| ZIP generation | not consistently defined | 4 | Packaging and bandwidth |
| Image delivery/hosting | 1 per image workflow | 8 | Binary storage and delivery placeholder |
| Video delivery/hosting | charged on delivery; variable | 25 | Larger storage and bandwidth placeholder |
| Confirmed GitHub commit | not consistently defined | 2 | Repository operation and audit metadata |
| Cloud sync | not consistently defined | 1 | Sync operation |
| Deploy / redeploy | 0 | 0 | No charge unless a separately listed PotHub platform service is used |

Action costs are initial policy values and must be compared with measured infrastructure invoices. No credits are charged when an agent is missing or a request fails validation before work begins.

## Infrastructure margin model

Assumptions in `server/pricing.js`: `infraCostPerCreditUsd = 0.0015` is a **placeholder**, not a measured invoice; infrastructure per order is $0.05; Play fee is 30%; web processing is 3.5% + $0.30. `npm run pricing:check` computes worst-channel margin assuming 100% of credits are spent. Every pack must pass the 50% target plus a 0.5 percentage-point buffer. If measured infrastructure cost differs, adjust credits per pack, never the target margin.

## Credit reservation lifecycle

AI operations reserve credits transactionally using a stable operation reference before the provider call. Successful validated results commit the reservation. Failed provider calls or invalid output release it and append a compensating ledger entry. A generated fix that contains no safe file patch releases its reservation rather than creating a random refund grant. Reservation state is stored in `credit_reservations`; the append-only `credit_ledger` records reserve and release movements with before/after balances. Video delivery reserves only after a result has been fetched and commits on a completed HTTP response; an aborted response releases the reservation.

### Stale reservation reconciliation

`npm run credits:reconcile -- --older-than-minutes=60` is a dry run. It lists reservations still in `reserved` state after the selected age. Inspect operation and delivery logs first: a failed settlement write can leave a successfully delivered operation reserved. Only after confirming that the result was not delivered, an administrator may run `npm run credits:reconcile -- --release --confirm --older-than-minutes=60`. The script is intentionally explicit and capped at 200 rows per invocation. It restores starter-credit attribution and writes a deterministic append-only ledger entry. Configure Firebase Admin credentials in the execution environment; never run this from a public API route.
