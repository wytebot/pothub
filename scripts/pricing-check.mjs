import { PACKS, calculatePack, ASSUMPTIONS, OPERATIONS } from '../server/pricing.js';
console.log(`Target margin: ${(ASSUMPTIONS.targetMargin*100).toFixed(0)}%; AI estimate/credit $${ASSUMPTIONS.aiCostPerCreditUsd.toFixed(4)} × ${ASSUMPTIONS.aiSafetyFactor} safety; infra/order $${ASSUMPTIONS.infrastructurePerOrderUsd.toFixed(2)}.`);
console.log('Pack | Price | Credits | AI (2x) | Worst channel fee | Infra | Estimated margin');
let failed=false;
for(const p of PACKS){const r=calculatePack(p);console.log(`${p.id} | $${p.usd.toFixed(2)} | ${p.credits} | $${r.aiCostUsd.toFixed(3)} | $${r.worstChannelFeeUsd.toFixed(3)} | $${r.infrastructureUsd.toFixed(2)} | ${(r.estimatedMargin*100).toFixed(1)}% ${r.passesTarget?'PASS':'FAIL'}`);if(!r.passesTarget)failed=true;}
console.log(`Operation costs: diagnosis ${OPERATIONS.diagnosis}, repair ${OPERATIONS.repair}, file ${OPERATIONS.file} credits.`);
if(failed){console.error('One or more packs miss the target under stated estimates. Credit counts cannot fix fee-only shortfalls; review prices/processor contracts.');process.exitCode=1;}
