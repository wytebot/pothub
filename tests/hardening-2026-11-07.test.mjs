import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decideArcadeClaim, arcadeDayKey, ARCADE_DAILY_CREDIT_CAP } from '../server/arcade-policy.js';
import { isValidBearerSecret } from '../server/billing-safety.js';
import { deterministicJobId, leaseRecovery, MAX_JOB_ATTEMPTS } from '../server/durable-jobs.js';

const app = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-07T12:00:00Z');

test('arcade claims are capped per account per UTC day', () => {
  let row = null;
  for (let i = 0; i < ARCADE_DAILY_CREDIT_CAP; i++) {
    const d = decideArcadeClaim(row, `ref-${i}`, NOW);
    assert.equal(d.action, 'grant');
    row = d.next;
  }
  assert.equal(decideArcadeClaim(row, 'ref-new', NOW).action, 'deny');
});

test('arcade claim retry of a counted reference is a duplicate, not a second slot', () => {
  const first = decideArcadeClaim(null, 'ref-1', NOW);
  const again = decideArcadeClaim(first.next, 'ref-1', NOW);
  assert.equal(again.action, 'duplicate');
  assert.deepEqual(again.next.refs, ['ref-1']);
});

test('arcade counter resets on a new UTC day', () => {
  const full = { day: arcadeDayKey(NOW), refs: Array.from({ length: ARCADE_DAILY_CREDIT_CAP }, (_, i) => `r${i}`) };
  const tomorrow = NOW + 24 * 3600 * 1000;
  const d = decideArcadeClaim(full, 'fresh', tomorrow);
  assert.equal(d.action, 'grant');
  assert.deepEqual(d.next.refs, ['fresh']);
});

test('bearer secret check is exact, scheme-strict and rejects short or missing secrets', () => {
  const secret = 'a-long-random-cron-secret-123456';
  assert.equal(isValidBearerSecret(secret, `Bearer ${secret}`), true);
  assert.equal(isValidBearerSecret(secret, `Bearer ${secret}x`), false);
  assert.equal(isValidBearerSecret(secret, secret), false);
  assert.equal(isValidBearerSecret(secret, `bearer ${secret}`), false);
  assert.equal(isValidBearerSecret('', 'Bearer '), false);
  assert.equal(isValidBearerSecret('short', 'Bearer short'), false);
  assert.equal(isValidBearerSecret(secret, undefined), false);
});

test('job ids are deterministic per account+operation and UUID-shaped', () => {
  const a = deterministicJobId('u1', 'operation-0001');
  assert.equal(a, deterministicJobId('u1', 'operation-0001'));
  assert.notEqual(a, deterministicJobId('u2', 'operation-0001'));
  assert.notEqual(a, deterministicJobId('u1', 'operation-0002'));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('stale worker leases are requeued, then failed after the attempt cap', () => {
  const base = { state: 'running', leaseExpiresAt: NOW - 1, attempts: 1 };
  assert.equal(leaseRecovery(base, NOW), 'requeue');
  assert.equal(leaseRecovery({ ...base, attempts: MAX_JOB_ATTEMPTS }, NOW), 'fail');
  assert.equal(leaseRecovery({ ...base, leaseExpiresAt: NOW + 1000 }, NOW), 'none');
  assert.equal(leaseRecovery({ ...base, state: 'succeeded' }, NOW), 'none');
  assert.equal(leaseRecovery({ ...base, cancelRequested: true }, NOW), 'none');
  assert.equal(leaseRecovery(null, NOW), 'none');
});

test('server wiring: cron, arcade, checkout and jobs use the hardened paths', () => {
  assert.match(app, /isValidBearerSecret\(String\(process\.env\.CRON_SECRET/);
  assert.doesNotMatch(app, /auth!==`Bearer \$\{secret\}`/);
  assert.match(app, /decideArcadeClaim\(snap\.exists/);
  assert.match(app, /dailyLimitReached:true/);
  assert.match(app, /different pack\. Start a new checkout/);
  assert.match(app, /deterministicJobId\(s\.user\.id,i\.operationId\)/);
  assert.match(app, /TOO_MANY_ACTIVE_JOBS/);
  assert.match(app, /leaseRecovery\(row\)/);
});

test('firestore config enables the collection-group job queue queries', () => {
  const idx = JSON.parse(fs.readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  assert.ok(idx.fieldOverrides.some(o => o.collectionGroup === 'jobs' && o.fieldPath === 'state' && o.indexes.some(i => i.queryScope === 'COLLECTION_GROUP')));
  assert.ok(idx.indexes.some(i => i.collectionGroup === 'jobs' && i.queryScope === 'COLLECTION_GROUP' && i.fields.map(f => f.fieldPath).join() === 'state,leaseExpiresAt'));
});
