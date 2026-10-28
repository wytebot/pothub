/** Pricing assumptions, not a guarantee. Review against live invoices before launch. */
export const PACKS = [
  { id: 'spark', name: 'Starter', usd: 1.99, credits: 20, maxCreditsAtTarget: 20 },
  { id: 'builder', name: 'Developer', usd: 4.99, credits: 60, maxCreditsAtTarget: 60 },
  { id: 'pro', name: 'Professional', usd: 9.99, credits: 130, maxCreditsAtTarget: 130 },
  { id: 'power', name: 'Power', usd: 19.99, credits: 260, maxCreditsAtTarget: 260 }
];
export const OPERATIONS = { diagnosis: 10, repair: 20, file: 15 };
export const ASSUMPTIONS = {
  targetMargin: 0.60,
  aiCostPerCreditUsd: 0.001,
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
