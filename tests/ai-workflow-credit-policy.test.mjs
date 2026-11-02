import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_FREE_CREDITS, DAILY_FREE_INTERVAL_MS, shouldChargeForAiWorkflow, nextDailyFreeGrantAt, isDailyFreeGrantDue } from '../server/credit-policy.js';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('each successful agent workflow consumes one credit', () => {
  assert.equal(shouldChargeForAiWorkflow(0), true);
  assert.equal(shouldChargeForAiWorkflow(1), true);
  assert.equal(shouldChargeForAiWorkflow(2), true);
  assert.equal(shouldChargeForAiWorkflow(3), true);
  assert.equal(shouldChargeForAiWorkflow(4), true);
  assert.equal(shouldChargeForAiWorkflow(5), true);
  assert.equal(shouldChargeForAiWorkflow(-1), false);
});

test('five daily free credits use a rolling 24-hour window, not UTC date boundaries', () => {
  const last = Date.UTC(2026, 10, 1, 23, 50);
  assert.equal(DAILY_FREE_CREDITS, 5);
  assert.equal(DAILY_FREE_INTERVAL_MS, 86400000);
  assert.equal(nextDailyFreeGrantAt(last), last + 86400000);
  assert.equal(isDailyFreeGrantDue(last, last + 86399999), false);
  assert.equal(isDailyFreeGrantDue(last, last + 86400000), true);
  assert.equal(isDailyFreeGrantDue(0, Date.now()), true);
});

test('server applies the shared meter to text, image and delivered-video AI workflows', async () => {
  const lib = await read('server/lib.js');
  const app = await read('server/app.js');
  assert.match(lib, /shouldChargeForAiWorkflow\(completed\)/);
  assert.match(app, /beginAiWorkflowBilling\(userId,operationId\)/);
  assert.match(app, /beginAiWorkflowBilling\(session\.user\.id,operationId\)/);
  assert.match(app, /beginAiWorkflowBilling\(s\.user\.id,deliveryOperationId\)/);
  assert.match(app, /completeAiWorkflowBilling\(s\.user\.id,cost\.workflowLease\)/);
});
