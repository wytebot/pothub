/**
 * PotHub plans. Credits are gone: free accounts get a daily allowance of agent actions, premium is unlimited.
 *
 * Money rules (kept deliberately simple and testable):
 *  - Prices are charged in USD through the existing verified Flutterwave order flow. A naira figure is shown
 *    for information only and exists only when NGN_PER_USD is configured; PotHub never invents an exchange rate.
 *  - Pay first, trial after: a first-time subscriber pays the plan price at checkout, and the free trial days
 *    (7 monthly, 10 yearly) come before the paid period starts. Returning subscribers get no second trial.
 *  - There is no automatic renewal. Premium simply expires at the end of the paid period unless the user pays again;
 *    renewing early extends from the current end date, so no paid time is lost.
 */
export const FREE_DAILY_ACTIONS = 20;
const DAY = 86400000;

export const PLANS = Object.freeze({
  monthly: Object.freeze({ plan: 'monthly', id: 'premium-monthly', name: 'Premium Monthly', usd: 9.99, periodDays: 30, trialDays: 7 }),
  yearly: Object.freeze({ plan: 'yearly', id: 'premium-yearly', name: 'Premium Yearly', usd: 99.99, periodDays: 365, trialDays: 10 }),
});

/** Order-shaped entries so plans can reuse the existing checkout/authorize/verify order flow (credits stay 0). */
export const PLAN_ORDER_PACKS = Object.freeze(Object.fromEntries(
  Object.values(PLANS).map((p) => [p.id, Object.freeze({ id: p.id, name: p.name, usd: p.usd, credits: 0, plan: p.plan })])
));

export const planForPackId = (packId) => Object.values(PLANS).find((p) => p.id === String(packId || '')) || null;

export const PLAN_FEATURES = Object.freeze({
  free: Object.freeze([
    `${FREE_DAILY_ACTIONS} agent actions per day`,
    'Chat, image and video tools with your own API keys',
    'Repository chats with @file mentions',
    'Chat history saved on your device and synced to your account',
    'Jobs pause at the limit or offline and resume automatically',
  ]),
  premium: Object.freeze([
    'Unlimited agent actions',
    'Everything in Free',
    'Diagnosis, repair and multi-file edit agents without a daily cap',
    'Priority for large repositories and long-running jobs',
    'Monthly: 7-day free trial. Yearly: 10-day free trial',
  ]),
});

export function ngnPerUsd(env = process.env) {
  const n = Number(env?.NGN_PER_USD);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function planPricing(env = process.env) {
  const rate = ngnPerUsd(env);
  return Object.values(PLANS).map((p) => ({
    plan: p.plan, id: p.id, name: p.name, usd: p.usd, periodDays: p.periodDays, trialDays: p.trialDays,
    ngn: rate ? Math.round(p.usd * rate) : null,
  }));
}

export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const nextResetAt = (now = Date.now()) => Math.floor(now / DAY) * DAY + DAY;

const ms = (v) => (typeof v?.toMillis === 'function' ? v.toMillis() : Number(v || 0));

/** @returns {{premium:boolean,status:'none'|'trialing'|'active'|'expired',plan:string|null,trialEndsAt:number,currentPeriodEnd:number,trialUsed:boolean}} */
export function subscriptionState(sub, now = Date.now()) {
  if (!sub || typeof sub !== 'object') return { premium: false, status: 'none', plan: null, trialEndsAt: 0, currentPeriodEnd: 0, trialUsed: false };
  const trialEndsAt = ms(sub.trialEndsAt), end = ms(sub.currentPeriodEnd), plan = PLANS[sub.plan] ? sub.plan : null;
  const base = { plan, trialEndsAt, currentPeriodEnd: end, trialUsed: !!sub.trialUsed };
  if (!plan || end <= now) return { ...base, premium: false, status: 'expired' };
  return { ...base, premium: true, status: trialEndsAt > now ? 'trialing' : 'active' };
}

/** Next stored subscription after a verified payment. Pure: callers persist the result. */
export function applyPlanPayment(prev, plan, paidAt = Date.now()) {
  const p = PLANS[plan];
  if (!p) throw new Error('Unknown plan.');
  const before = subscriptionState(prev, paidAt);
  const wasPremium = before.premium;
  const trialDays = prev?.trialUsed ? 0 : p.trialDays;
  const start = wasPremium ? before.currentPeriodEnd : paidAt;
  const trialEndsAt = wasPremium ? before.trialEndsAt : paidAt + trialDays * DAY;
  const periodStart = wasPremium ? start : trialEndsAt;
  return { plan, trialUsed: true, trialEndsAt, currentPeriodEnd: periodStart + p.periodDays * DAY, updatedAt: paidAt };
}

/**
 * What counts toward the free daily allowance: AI agent operations (diagnosis, repair, planning, editing,
 * Codelab agents). Plain chat, pull requests, repository delete/revert, and image/video/file generation do not
 * count. This one pattern is the single place to change that decision.
 */
const AGENT_ACTION = /(agent|diagnos|repair|edit chat)/i;
export const isAgentAction = (reason) => AGENT_ACTION.test(String(reason || ''));
