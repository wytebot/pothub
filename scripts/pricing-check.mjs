import { PACKS, calculatePack, calculatePackChannels, ASSUMPTIONS, OPERATIONS, BYO_SERVICE_FEES, PROVIDER_COSTS, USAGE_SCENARIOS, estimateProviderOperation } from '../server/pricing.js';
console.log(`Target margin: ${(ASSUMPTIONS.targetMargin*100).toFixed(0)}%; planning AI estimate/credit $${ASSUMPTIONS.aiCostPerCreditUsd.toFixed(4)} × ${ASSUMPTIONS.aiSafetyFactor} safety; infra/order $${ASSUMPTIONS.infrastructurePerOrderUsd.toFixed(2)}.`);
console.log('\nPack economics (prices and credits unchanged; provider cost is a planning estimate)');
console.log('Pack | Price | Credits | AI | Infra | Web fee | Web margin | Play fee | Play margin');
let failed=false;
for(const p of PACKS){const r=calculatePack(p),c=calculatePackChannels(p);console.log(`${p.id} | $${p.usd.toFixed(2)} | ${p.credits} | $${r.aiCostUsd.toFixed(3)} | $${r.infrastructureUsd.toFixed(2)} | $${c.web.fees.toFixed(3)} | ${(c.web.margin*100).toFixed(1)}% | $${c.play.fees.toFixed(3)} | ${(c.play.margin*100).toFixed(1)}%`);if(!r.passesTarget)failed=true;}
console.log(`\nOperation credit costs: diagnosis=${OPERATIONS.diagnosis}, repair=${OPERATIONS.repair}; BYO Developer=${BYO_SERVICE_FEES.developer}, Creator=${BYO_SERVICE_FEES.creator}.`);
console.log('\nProvider cost sensitivity (illustrative rate card; verify current vendor invoices before launch)');
for(const [id,rates] of Object.entries(PROVIDER_COSTS)){const t=estimateProviderOperation(id,USAGE_SCENARIOS.typical),h=estimateProviderOperation(id,USAGE_SCENARIOS.heavy);console.log(`${id} | typical tokens $${t.tokensUsd.toFixed(5)} | heavy tokens $${h.tokensUsd.toFixed(5)} | image ${rates.image??'n/a'} | video/sec ${rates.videoPerSecond??'n/a'}`)}
console.log('\nSensitivity: gross margin under 0.5× / 1× / 2× AI cost (web checkout)');
for(const p of PACKS){const row=[0.5,1,2].map(k=>{const c=(p.credits*ASSUMPTIONS.aiCostPerCreditUsd*ASSUMPTIONS.aiSafetyFactor*k)+ASSUMPTIONS.infrastructurePerOrderUsd+(p.usd*ASSUMPTIONS.webProcessorRate+ASSUMPTIONS.webProcessorFlatUsd);return `${((p.usd-c)/p.usd*100).toFixed(1)}%`});console.log(`${p.id}: ${row.join(' / ')}`)}
if(failed){console.error('One or more packs miss the configured planning target.');process.exitCode=1}
