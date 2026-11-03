/** BYOK pricing: credits pay only for PotHub infrastructure, never model inference. */
export const PACKS = [
  { id: 'spark', name: 'Starter', usd: 1.99, credits: 200, maxCreditsAtTarget: 200 },
  { id: 'builder', name: 'Developer', usd: 4.99, credits: 600, maxCreditsAtTarget: 600 },
  { id: 'pro', name: 'Professional', usd: 9.99, credits: 1200, maxCreditsAtTarget: 1200 },
  { id: 'power', name: 'Power', usd: 19.99, credits: 2400, maxCreditsAtTarget: 2400 }
];
export const OPERATIONS = { chat: 1, diagnosis: 1, repair: 3, fileGeneration: 3, zipGeneration: 4, imageDelivery: 8, videoDelivery: 25, githubCommit: 2, cloudSync: 1 };
export const BYO_SERVICE_FEES = { developer: 1, creator: 1 };
export const ASSUMPTIONS = {
  targetMargin: 0.50,
  infraCostPerCreditUsd: 0.0015, // PLACEHOLDER until measured invoices replace it.
  infrastructurePerOrderUsd: 0.05,
  playFeeRate: 0.30,
  webProcessorRate: 0.035,
  webProcessorFlatUsd: 0.30,
  targetBuffer: 0.005
};
export function calculatePack(pack) {
  const infrastructure = pack.credits * ASSUMPTIONS.infraCostPerCreditUsd + ASSUMPTIONS.infrastructurePerOrderUsd;
  const playFees = pack.usd * ASSUMPTIONS.playFeeRate;
  const webFees = pack.usd * ASSUMPTIONS.webProcessorRate + ASSUMPTIONS.webProcessorFlatUsd;
  const worstChannelFee = Math.max(playFees, webFees);
  const total = infrastructure + worstChannelFee;
  const estimatedMargin = (pack.usd-total)/pack.usd;
  return { ...pack, aiCostUsd: 0, infrastructureUsd: infrastructure, playFeesUsd: playFees, webFeesUsd: webFees, worstChannelFeeUsd: worstChannelFee, estimatedCostUsd: total, estimatedMargin, passesTarget: estimatedMargin >= ASSUMPTIONS.targetMargin + ASSUMPTIONS.targetBuffer };
}
export const PROVIDER_COSTS = {};
export const USAGE_SCENARIOS = { typical: { inputTokens: 0, outputTokens: 0, images: 0, videoSeconds: 0 }, heavy: { inputTokens: 0, outputTokens: 0, images: 0, videoSeconds: 0 } };
export function estimateProviderOperation(provider='byok',usage=USAGE_SCENARIOS.typical) { return { provider, tokensUsd: 0, imageUsd: 0, videoUsd: 0, totalUsd: 0, usage, note: 'Provider usage is billed directly to the user by their configured provider; PotHub does not estimate or pay these charges.' }; }
export function calculatePackChannels(pack) {
  const infra=pack.credits*ASSUMPTIONS.infraCostPerCreditUsd+ASSUMPTIONS.infrastructurePerOrderUsd;
  const web=pack.usd*ASSUMPTIONS.webProcessorRate+ASSUMPTIONS.webProcessorFlatUsd;
  const play=pack.usd*ASSUMPTIONS.playFeeRate;
  return { web:{fees:web,cost:infra+web,margin:(pack.usd-infra-web)/pack.usd}, play:{fees:play,cost:infra+play,margin:(pack.usd-infra-play)/pack.usd} };
}
