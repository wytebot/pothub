import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, ASSUMPTIONS, calculatePack, calculatePackChannels, OPERATIONS } from '../server/pricing.js';
import { interleaveAgentCandidates } from '../src/lib/agent-routing.js';
test('BYOK packs match approved prices and credits',()=>assert.deepEqual(PACKS.map(p=>[p.usd,p.credits]),[[1.99,200],[4.99,600],[9.99,1200],[19.99,2400]]));
test('all packs clear 50% target plus buffer under worst channel fees',()=>{for(const p of PACKS){assert.ok(calculatePack(p).passesTarget,p.id);assert.ok(calculatePackChannels(p).play.margin>=ASSUMPTIONS.targetMargin+ASSUMPTIONS.targetBuffer,p.id)}});
test('pricing excludes inference costs and action prices are integer credits',()=>{assert.equal(ASSUMPTIONS.infraCostPerCreditUsd,.0015);assert.ok(Object.values(OPERATIONS).every(Number.isSafeInteger));assert.equal(calculatePack(PACKS[0]).aiCostUsd,0)});
test('fallback candidates remain bound to saved task, key, provider and model',()=>{const out=interleaveAgentCandidates([{key:'k1',provider:'gemini',task:'image',models:['image-model']},{key:'k2',provider:'openai',task:'chat',models:['text-model']}]);assert.deepEqual(out.map(x=>[x.key,x.provider,x.task,x.model]),[['k1','gemini','image','image-model'],['k2','openai','chat','text-model']])});
