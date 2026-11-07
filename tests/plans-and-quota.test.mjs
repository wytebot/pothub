import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE_DAILY_ACTIONS, PLANS, PLAN_ORDER_PACKS, planPricing, subscriptionState, applyPlanPayment, nextResetAt, isAgentAction, planForPackId, dayKey } from '../server/plans.js';
import { consumeAgentAction, refundAgentAction, readUsage, activatePlan, readSubscription } from '../server/usage-quota.js';

// Minimal in-memory Firestore double: collection().doc().get/set and serial runTransaction.
function fakeStore() {
  const data = new Map();
  const doc = (c, id) => ({ get: async () => ({ exists: data.has(`${c}/${id}`), data: () => structuredClone(data.get(`${c}/${id}`)) }), set: async (v) => { data.set(`${c}/${id}`, structuredClone(v)); }, _k: `${c}/${id}` });
  const store = { collection: (c) => ({ doc: (id) => doc(c, id) }), data };
  let chain = Promise.resolve();
  store.runTransaction = (fn) => (chain = chain.then(async () => {
    const writes = [];
    const tx = { get: (ref) => ref.get(), set: (ref, v) => writes.push([ref, v]) };
    const out = await fn(tx); for (const [ref, v] of writes) await ref.set(v); return out;
  }));
  return store;
}
const T0 = Date.UTC(2026, 10, 6, 12, 0, 0), DAY = 86400000;

test('prices, trials and the free allowance match the product decision', () => {
  assert.equal(FREE_DAILY_ACTIONS, 20);
  assert.deepEqual([PLANS.monthly.usd, PLANS.monthly.trialDays, PLANS.monthly.periodDays], [9.99, 7, 30]);
  assert.deepEqual([PLANS.yearly.usd, PLANS.yearly.trialDays, PLANS.yearly.periodDays], [99.99, 10, 365]);
  assert.equal(PLAN_ORDER_PACKS['premium-monthly'].credits, 0);
  assert.equal(planForPackId('premium-yearly').plan, 'yearly');
  assert.equal(planForPackId('spark'), null);
});

test('naira equivalent only exists when a rate is configured; no invented rate', () => {
  assert.ok(planPricing({}).every((p) => p.ngn === null));
  const rows = planPricing({ NGN_PER_USD: '1500' });
  assert.equal(rows.find((p) => p.plan === 'monthly').ngn, 14985);
  assert.equal(rows.find((p) => p.plan === 'yearly').ngn, 149985);
  assert.ok(planPricing({ NGN_PER_USD: 'abc' }).every((p) => p.ngn === null));
});

test('free users: 20 actions, the 21st is refused with a 429 and a reset time', async () => {
  const s = fakeStore();
  for (let i = 1; i <= 20; i++) assert.equal((await consumeAgentAction(s, { userId: 'u1', reference: `op${i}`, now: T0 })).used, i);
  await assert.rejects(() => consumeAgentAction(s, { userId: 'u1', reference: 'op21', now: T0 }), (e) => e.status === 429 && e.code === 'daily_limit_reached' && e.resetsAt === nextResetAt(T0) && e.limit === 20);
  assert.deepEqual(await readUsage(s, { userId: 'u1', now: T0 }), { used: 20, limit: 20, remaining: 0, resetsAt: nextResetAt(T0) });
});

test('retrying the same operation never counts twice, and users are isolated', async () => {
  const s = fakeStore();
  await consumeAgentAction(s, { userId: 'u1', reference: 'same', now: T0 });
  assert.equal((await consumeAgentAction(s, { userId: 'u1', reference: 'same', now: T0 })).duplicate, true);
  assert.equal((await readUsage(s, { userId: 'u1', now: T0 })).used, 1);
  assert.equal((await readUsage(s, { userId: 'u2', now: T0 })).used, 0);
});

test('parallel requests cannot exceed the limit', async () => {
  const s = fakeStore();
  const results = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => consumeAgentAction(s, { userId: 'u1', reference: `p${i}`, now: T0 })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 20);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.status === 429).length, 10);
});

test('a failed operation gives its action back, exactly once', async () => {
  const s = fakeStore();
  await consumeAgentAction(s, { userId: 'u1', reference: 'a', now: T0 });
  assert.equal((await refundAgentAction(s, { userId: 'u1', reference: 'a', now: T0 })).refunded, true);
  assert.equal((await refundAgentAction(s, { userId: 'u1', reference: 'a', now: T0 })).refunded, false);
  assert.equal((await refundAgentAction(s, { userId: 'u1', reference: 'never', now: T0 })).refunded, false);
  assert.equal((await readUsage(s, { userId: 'u1', now: T0 })).used, 0);
});

test('the allowance resets at the next UTC day', async () => {
  const s = fakeStore();
  for (let i = 0; i < 20; i++) await consumeAgentAction(s, { userId: 'u1', reference: `d${i}`, now: T0 });
  const tomorrow = nextResetAt(T0);
  assert.notEqual(dayKey(T0), dayKey(tomorrow));
  assert.equal((await consumeAgentAction(s, { userId: 'u1', reference: 'new', now: tomorrow })).used, 1);
});

test('first monthly payment: 7 free trial days first, then the 30-day paid period', async () => {
  const s = fakeStore();
  const r = await activatePlan(s, { userId: 'u1', plan: 'monthly', reference: 'kh1', paidAt: T0 });
  assert.equal(r.subscription.status, 'trialing');
  assert.equal(r.subscription.trialEndsAt, T0 + 7 * DAY);
  assert.equal(r.subscription.currentPeriodEnd, T0 + 37 * DAY);
  assert.equal(subscriptionState(await readSubscription(s, 'u1'), T0 + 8 * DAY).status, 'active');
  assert.equal(subscriptionState(await readSubscription(s, 'u1'), T0 + 37 * DAY + 1).premium, false);
});

test('first yearly payment gets 10 trial days', () => {
  const sub = applyPlanPayment(null, 'yearly', T0);
  assert.equal(sub.trialEndsAt, T0 + 10 * DAY);
  assert.equal(sub.currentPeriodEnd, T0 + 375 * DAY);
});

test('renewal extends from the current end and never grants a second trial', async () => {
  const s = fakeStore();
  const first = await activatePlan(s, { userId: 'u1', plan: 'monthly', reference: 'kh1', paidAt: T0 });
  const early = await activatePlan(s, { userId: 'u1', plan: 'monthly', reference: 'kh2', paidAt: T0 + 20 * DAY });
  assert.equal(early.subscription.currentPeriodEnd, first.subscription.currentPeriodEnd + 30 * DAY);
  const lapsed = await activatePlan(s, { userId: 'u1', plan: 'yearly', reference: 'kh3', paidAt: T0 + 200 * DAY });
  assert.equal(lapsed.subscription.trialEndsAt, T0 + 200 * DAY, 'no new trial for a returning subscriber');
  assert.equal(lapsed.subscription.currentPeriodEnd, T0 + 200 * DAY + 365 * DAY);
});

test('the same payment reference cannot extend premium twice (webhook + verify race)', async () => {
  const s = fakeStore();
  const [a, b] = await Promise.all([1, 2].map(() => activatePlan(s, { userId: 'u1', plan: 'monthly', reference: 'khSAME', paidAt: T0 })));
  assert.deepEqual([a.duplicate, b.duplicate].sort(), [false, true]);
  assert.equal(subscriptionState(await readSubscription(s, 'u1'), T0).currentPeriodEnd, T0 + 37 * DAY);
});

test('subscriptionState is safe on missing or malformed data', () => {
  for (const v of [null, undefined, 'x', {}, { plan: 'weekly', currentPeriodEnd: T0 + DAY }]) assert.equal(subscriptionState(v, T0).premium, false);
});

test('only AI agent operations count toward the daily allowance', () => {
  for (const r of ['Prepare repair', 'Codelab agent plan', 'Codelab agent planning', 'Codelab agent synthesis', 'Repository-aware Edit chat', 'AI diagnosis'])
    assert.equal(isAgentAction(r), true, r);
  for (const r of ['Creator chat', 'chat', 'Create pull request', 'Delete GitHub repository', 'Revert repository', 'Revert repository fix', 'image', 'file-generation', 'Delivered video workflow', 'format-correction', 'toolbar', '', undefined])
    assert.equal(isAgentAction(r), false, String(r));
});
