/** Pricing assumptions, not a guarantee. Review against live invoices before launch. */
export const PACKS = [
  { id: 'spark', name: 'Starter', usd: 1.99, credits: 24, maxCreditsAtTarget: 24 },
  { id: 'builder', name: 'Developer', usd: 4.99, credits: 74, maxCreditsAtTarget: 74 },
  { id: 'pro', name: 'Professional', usd: 9.99, credits: 158, maxCreditsAtTarget: 158 },
  { id: 'power', name: 'Power', usd: 19.99, credits: 324, maxCreditsAtTarget: 324 }
];
export const OPERATIONS = { diagnosis: 10, repair: 20, file: 15 };
export const BYO_SERVICE_FEES = { developer: 2, creator: 1 };
export const ASSUMPTIONS = {
  targetMargin: 0.60,
  // Conservative planning estimate: $0.003 variable provider cost per credit, doubled for model/token variance. Replace with measured provider invoices after launch.
  aiCostPerCreditUsd: 0.003,
  aiSafetyFactor: 2,
  infrastructurePerOrderUsd: 0.05,
  playFeeRate: 0.30,
  webProcessorRate: 0.035,
  webProcessorFlatUsd: 0.30,
  // Channel fees are alternatives, not stacked: Play handles Play purchases;
  // Flutterwave fees apply to web checkout. Confirm actual merchant rates.
};
export function calculatePack(pack) {
  const ai = pack.credits * ASSUMPTIONS.aiCostPerCreditUsd * ASSUMPTIONS.aiSafetyFactor;
  const infrastructure = ASSUMPTIONS.infrastructurePerOrderUsd;
  const playFees = pack.usd * ASSUMPTIONS.playFeeRate;
  const webFees = pack.usd * ASSUMPTIONS.webProcessorRate + ASSUMPTIONS.webProcessorFlatUsd;
  const worstChannelFee = Math.max(playFees, webFees);
  const total = ai + infrastructure + worstChannelFee;
  return { ...pack, aiCostUsd: ai, infrastructureUsd: infrastructure, playFeesUsd: playFees, webFeesUsd: webFees, worstChannelFeeUsd: worstChannelFee, estimatedCostUsd: total, estimatedMargin: (pack.usd-total)/pack.usd, passesTarget: (pack.usd-total)/pack.usd >= ASSUMPTIONS.targetMargin };
}
