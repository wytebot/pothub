import { PACKS, calculatePack, calculatePackChannels, ASSUMPTIONS, OPERATIONS } from '../server/pricing.js';
console.log(`BYOK-only infrastructure pricing. AI inference cost to PotHub: $0. Target gross margin: ${(ASSUMPTIONS.targetMargin*100).toFixed(1)}%; required buffer: ${(ASSUMPTIONS.targetBuffer*100).toFixed(1)} percentage points.`);
console.log(`Infrastructure assumption: $${ASSUMPTIONS.infraCostPerCreditUsd.toFixed(4)}/credit (PLACEHOLDER; replace with measured invoices) + $${ASSUMPTIONS.infrastructurePerOrderUsd.toFixed(2)}/order.`);
console.log('Pack | Price | Credits | Infra/order+credits | Worst fee | Play margin | Web margin | Worst margin');
let failed=false;
for (const pack of PACKS) { const p=calculatePack(pack), c=calculatePackChannels(pack); console.log(`${pack.id} | $${pack.usd.toFixed(2)} | ${pack.credits} | $${p.infrastructureUsd.toFixed(3)} | $${p.worstChannelFeeUsd.toFixed(3)} | ${(c.play.margin*100).toFixed(2)}% | ${(c.web.margin*100).toFixed(2)}% | ${(p.estimatedMargin*100).toFixed(2)}%`); if(!p.passesTarget) failed=true; }
console.log('Action costs (credits):', JSON.stringify(OPERATIONS));
if(failed){console.error('One or more packs miss the target margin plus buffer.');process.exitCode=1;}
