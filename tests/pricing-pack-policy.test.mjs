import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, calculatePack, ASSUMPTIONS } from '../server/pricing.js';
test('server-priced credit packs use the requested allowances', () => {
  assert.deepEqual(PACKS.map(p => p.credits), [120, 350, 700, 1400]);
});
test('BYOK has no platform-funded AI cost and worst-channel planning margin passes', () => {
  assert.equal(ASSUMPTIONS.aiCostPerCreditUsd, 0);
  assert.ok(PACKS.every(p => calculatePack(p).passesTarget));
});
