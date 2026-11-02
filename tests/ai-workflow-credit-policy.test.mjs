import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_FREE_CREDITS, DAILY_FREE_INTERVAL_MS, shouldChargeForAiWorkflow, nextDailyFreeGrantAt, isDailyFreeGrantDue } from '../server/credit-policy.js';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('one credit is charged at the first workflow of each three-success batch', () => {
  assert.equal(shouldChargeForAiWorkflow(0), true);  // first AI job charges immediately
  assert.equal(shouldChargeForAiWorkflow(1), false); // second successful job is covered
  assert.equal(shouldChargeForAiWorkflow(2), false); // third successful job is covered
  assert.equal(shouldChargeForAiWorkflow(3), true);  // next batch charges on its first job
  assert.equal(shouldChargeForAiWorkflow(4), false);
  assert.equal(shouldChargeForAiWorkflow(5), false);
  assert.equal(shouldChargeForAiWorkflow(6), true);
  assert.equal(shouldChargeForAiWorkflow(-1), false); // invalid counters never trigger a charge
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
