import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FILE_QUOTA_WINDOW_MS, FREE_FILE_LIMIT, quotaView } from './fileQuota';

test('free quota starts at thirty and returns exact reset time', () => {
  const now = 100_000; const q = quotaView(false, 3, now, now);
  assert.equal(q.limit, 30); assert.equal(q.remaining, 27); assert.equal(q.resetAt, new Date(now + FILE_QUOTA_WINDOW_MS).toISOString());
});
test('expired free quota resets after 24 hours', () => {
  const now = 100_000; const q = quotaView(false, 30, now, now + FILE_QUOTA_WINDOW_MS);
  assert.equal(q.used, 0); assert.equal(q.remaining, 30); assert.equal(q.resetAt, null);
});
test('premium quota is unlimited', () => {
  const q = quotaView(true, 999, 1, 1_000);
  assert.equal(q.premium, true); assert.equal(q.limit, null); assert.equal(q.remaining, null); assert.equal(q.resetAt, null);
});
test('free allowance never reports negative remaining', () => {
  const q = quotaView(false, 100, 100, 101);
  assert.equal(q.used, 30); assert.equal(q.remaining, 0);
});
