# Internal pricing and credit model

The source of truth is `server/pricing.js`. Packs are server-priced and the client only displays the returned values.

| Pack | Price | Credits |
|---|---:|---:|
| Starter | $1.99 | 24 |
| Developer | $4.99 | 74 |
| Professional | $9.99 | 158 |
| Power | $19.99 | 324 |

Current operation costs: diagnosis 10 credits, fix generation 20 credits. BYO service fees are 2 credits for Developer operations and 1 credit for Creator operations. Video is charged idempotently only when the result is stored and made available for delivery; a failed or locally cancelled job is not charged unless a result is delivered.

Assumptions in `server/pricing.js` are planning estimates, not provider quotes or a net-margin guarantee. Replace them with measured provider invoices, payment processing fees, storage/egress, taxes, refunds, chargebacks and operational costs before launch. Run `npm run pricing:check` to print the current pack table. The checker must never silently change user-facing prices.
