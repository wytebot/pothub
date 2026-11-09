/**
 * Daily agent-action quota and subscription storage. Works against any Firestore-shaped store
 * (collection().doc().get/set and runTransaction), which keeps it testable without firebase-admin.
 */
import crypto from 'node:crypto';
import { FREE_DAILY_ACTIONS, applyPlanPayment, dayKey, nextResetAt, subscriptionState } from './plans.js';

const refKey = (reference) => crypto.createHash('sha256').update(String(reference)).digest('hex').slice(0, 24);
const usageRef = (store, userId, day) => store.collection('usage_daily').doc(`${userId}_${day}`);

export function limitError(used, limit, now) {
  return Object.assign(new Error(`You have used your ${limit} free agent actions for today. Your work is paused and resumes automatically when the limit resets, or right away if you upgrade to Premium.`), {
    status: 429, code: 'daily_limit_reached', limit, used, resetsAt: nextResetAt(now),
  });
}

/** Idempotent per reference: retrying the same operation never counts twice. Throws a 429 error at the limit. */
export async function consumeAgentAction(store, { userId, reference, limit = FREE_DAILY_ACTIONS, now = Date.now() }) {
  const ref = usageRef(store, userId, dayKey(now)), key = refKey(reference);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(ref), data = snap.exists ? snap.data() : { count: 0, refs: {} };
    const refs = data.refs || {}, count = Number(data.count || 0);
    if (refs[key]) return { used: count, limit, remaining: Math.max(0, limit - count), duplicate: true, resetsAt: nextResetAt(now) };
    if (count >= limit) throw limitError(count, limit, now);
    tx.set(ref, { count: count + 1, refs: { ...refs, [key]: now }, day: dayKey(now), userId: String(userId), updatedAt: now });
    return { used: count + 1, limit, remaining: limit - count - 1, duplicate: false, resetsAt: nextResetAt(now) };
  });
}

/** Give back an action when the operation failed. Safe to call twice or for an unknown reference. */
export async function refundAgentAction(store, { userId, reference, limit = FREE_DAILY_ACTIONS, now = Date.now() }) {
  const ref = usageRef(store, userId, dayKey(now)), key = refKey(reference);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { refunded: false };
    const data = snap.data(), refs = { ...(data.refs || {}) };
    if (!refs[key]) return { refunded: false };
    delete refs[key];
    const count = Math.max(0, Number(data.count || 0) - 1);
    tx.set(ref, { ...data, count, refs, updatedAt: now });
    return { refunded: true, used: count, limit, remaining: limit - count };
  });
}

export async function readUsage(store, { userId, limit = FREE_DAILY_ACTIONS, now = Date.now() }) {
  const snap = await usageRef(store, userId, dayKey(now)).get();
  const used = snap.exists ? Number(snap.data().count || 0) : 0;
  return { used, limit, remaining: Math.max(0, limit - used), resetsAt: nextResetAt(now) };
}

export async function readSubscription(store, userId) {
  const snap = await store.collection('subscriptions').doc(String(userId)).get();
  return snap.exists ? snap.data() : null;
}

/** Idempotent on the payment reference: a webhook and a verify call racing cannot extend premium twice. */
export async function activatePlan(store, { userId, plan, reference, paidAt = Date.now() }) {
  const ref = store.collection('subscriptions').doc(String(userId)), key = refKey(reference);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(ref), prev = snap.exists ? snap.data() : null;
    if (prev?.settled?.[key]) return { duplicate: true, subscription: subscriptionState(prev, paidAt) };
    const next = { ...applyPlanPayment(prev, plan, paidAt), settled: { ...(prev?.settled || {}), [key]: paidAt }, lastReference: String(reference) };
    tx.set(ref, next);
    return { duplicate: false, subscription: subscriptionState(next, paidAt) };
  });
}
