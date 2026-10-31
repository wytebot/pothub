/** Pricing assumptions, not a guarantee. Review against live invoices before launch. */
export const PACKS = [
  { id: 'spark', name: 'Starter', usd: 1.99, credits: 24, maxCreditsAtTarget: 24 },
  { id: 'builder', name: 'Developer', usd: 4.99, credits: 74, maxCreditsAtTarget: 74 },
  { id: 'pro', name: 'Professional', usd: 9.99, credits: 158, maxCreditsAtTarget: 158 },
  { id: 'power', name: 'Power', usd: 19.99, credits: 324, maxCreditsAtTarget: 324 }
];
export const OPERATIONS = { diagnosis: 10, repair: 20 };
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

/** Planning inputs are intentionally editable and must be reconciled to vendor invoices.
 * USD per million tokens; image/video rates are per generated image/second. */
export const PROVIDER_COSTS = {
  gemini:{inputPerMillion:0.30,outputPerMillion:2.50,image:0.039,videoPerSecond:0.10},
  openai:{inputPerMillion:2.00,outputPerMillion:8.00,image:0.04,videoPerSecond:null},
  anthropic:{inputPerMillion:3.00,outputPerMillion:15.00,image:null,videoPerSecond:null},
  mistral:{inputPerMillion:0.20,outputPerMillion:0.60,image:null,videoPerSecond:null},
  groq:{inputPerMillion:0.59,outputPerMillion:0.79,image:null,videoPerSecond:null},
  deepseek:{inputPerMillion:0.27,outputPerMillion:1.10,image:null,videoPerSecond:null},
  xai:{inputPerMillion:2.00,outputPerMillion:10.00,image:null,videoPerSecond:null},
  cohere:{inputPerMillion:2.50,outputPerMillion:10.00,image:null,videoPerSecond:null},
  perplexity:{inputPerMillion:1.00,outputPerMillion:1.00,image:null,videoPerSecond:null},
  together:{inputPerMillion:0.90,outputPerMillion:0.90,image:null,videoPerSecond:null},
  fireworks:{inputPerMillion:0.90,outputPerMillion:0.90,image:null,videoPerSecond:null},
  openrouter:{inputPerMillion:1.00,outputPerMillion:3.00,image:null,videoPerSecond:null},
  huggingface:{inputPerMillion:1.00,outputPerMillion:1.00,image:null,videoPerSecond:null}
};
export const USAGE_SCENARIOS={typical:{inputTokens:5000,outputTokens:1200,images:0,videoSeconds:0},heavy:{inputTokens:24000,outputTokens:6000,images:2,videoSeconds:8}};
export function estimateProviderOperation(provider='gemini',usage=USAGE_SCENARIOS.typical){
  const r=PROVIDER_COSTS[provider]||PROVIDER_COSTS.gemini;
  const tokens=(usage.inputTokens*r.inputPerMillion+usage.outputTokens*r.outputPerMillion)/1_000_000;
  const imageCost=r.image==null?null:usage.images*r.image;
  const videoCost=r.videoPerSecond==null?null:usage.videoSeconds*r.videoPerSecond;
  return {provider,tokensUsd:tokens,imageUsd:imageCost,videoUsd:videoCost,totalUsd:imageCost===null||videoCost===null?null:tokens+imageCost+videoCost,usage};
}
export function calculatePackChannels(pack){
  const ai=pack.credits*ASSUMPTIONS.aiCostPerCreditUsd*ASSUMPTIONS.aiSafetyFactor;
  const infra=ASSUMPTIONS.infrastructurePerOrderUsd;
  const web=pack.usd*ASSUMPTIONS.webProcessorRate+ASSUMPTIONS.webProcessorFlatUsd;
  const play=pack.usd*ASSUMPTIONS.playFeeRate;
  return {web:{fees:web,cost:ai+infra+web,margin:(pack.usd-ai-infra-web)/pack.usd},play:{fees:play,cost:ai+infra+play,margin:(pack.usd-ai-infra-play)/pack.usd}};
}
