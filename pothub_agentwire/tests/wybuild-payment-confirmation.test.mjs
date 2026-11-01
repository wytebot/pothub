import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSharedWebhookSecret, isValidWyBuildSettlement } from '../server/billing-safety.js';
import { readFile } from 'node:fs/promises';

const order = { reference: 'kh' + 'a'.repeat(32), amount: 4.99, currency: 'USD', provider_charge_id: null };
const good = { reference: order.reference, id: 'charge_123', status: 'succeeded', amount: 4.99, currency: 'usd' };

test('PotHub accepts only matching successful WyBuild-verified settlements', () => {
  assert.equal(isValidWyBuildSettlement(order, good), true);
  for (const patch of [
    { reference: 'kh' + 'b'.repeat(32) },
    { status: 'pending' },
    { amount: 5 },
    { currency: 'NGN' },
    { id: '' },
  ]) assert.equal(isValidWyBuildSettlement(order, { ...good, ...patch }), false);
});

test('shared webhook secret uses constant-time equality and minimum length', () => {
  const secret = 'a-long-random-shared-secret-with-32-plus-chars';
  assert.equal(isValidSharedWebhookSecret(secret, secret), true);
  assert.equal(isValidSharedWebhookSecret(secret, secret + 'x'), false);
  assert.equal(isValidSharedWebhookSecret('short', 'short'), false);
});

test('PotHub confirmation endpoint is secret-gated and uses the idempotent credit ledger', async () => {
  const source = await readFile(new URL('../server/app.js', import.meta.url), 'utf8');
  assert.match(source, /app\.post\('\/api\/billing\/wybuild-confirmation'/);
  assert.match(source, /isValidSharedWebhookSecret\(expected,supplied\)/);
  assert.match(source, /addCredits\(String\(order\.github_id\),Number\(order\.credits\),reference/);
  assert.match(source, /action==='lookup'/);
});
