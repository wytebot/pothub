# Internal pricing and cost model

Do not show estimated margins to end users. Source of truth: `server/pricing.js`; run `npm run pricing:check` to print the pack table. Prices and credit counts are not silently changed by the checker.

Current packs: Spark $1.99/20, Builder $4.99/60, Pro $9.99/130, Power $19.99/260. Operation costs: diagnosis 10 credits, repair 20, file generation 15.

Assumptions currently encoded: AI cost estimate $0.001/credit multiplied by 2; infrastructure allowance $0.05/order; Google Play fee 30%; web processor estimate 3.5% + $0.30. The model applies the larger of Play fees and web processor fees because the channels are alternatives, not simultaneous fees. These are planning assumptions only, not provider quotes or a margin guarantee. Replace them with measured provider invoices, actual Play/processor contracts, refunds, chargebacks, tax and operational costs before launch.

`maxCreditsAtTarget` is explicitly recorded per pack for review. If the check fails, do not silently adjust user-facing pricing. Investigate costs and make a documented pricing decision. The current cost estimate omits some variable risks and is not certification of a 60% net margin.
