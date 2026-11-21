import { randomUUID, timingSafeEqual } from 'node:crypto';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { adminApp } from './adminApp';
import type { Identity } from './identity';

const db = () => getFirestore(adminApp());
const FLW_SECRET = process.env.FLW_SECRET_KEY ?? '';
const FLW_WEBHOOK_HASH = process.env.FLW_WEBHOOK_HASH ?? '';
const APP_ORIGIN = (process.env.APP_ORIGIN ?? '').replace(/\/$/, '');
const CURRENCY = (process.env.PREMIUM_CURRENCY ?? 'USD').toUpperCase();
const MONTHLY_AMOUNT = Number(process.env.PREMIUM_MONTHLY_AMOUNT ?? 4.99);
const YEARLY_AMOUNT = Number(process.env.PREMIUM_YEARLY_AMOUNT ?? 45);
const MONTHLY_DAYS = 30;
const YEARLY_DAYS = 365;
type PremiumPlan = 'monthly' | 'yearly';
const planDetails = (plan: PremiumPlan) => plan === 'yearly' ? { amount: YEARLY_AMOUNT, days: YEARLY_DAYS, label: 'Annual' } : { amount: MONTHLY_AMOUNT, days: MONTHLY_DAYS, label: 'Monthly' };
const parsePlan = (v: unknown): PremiumPlan => v === 'yearly' ? 'yearly' : 'monthly';
const api = 'https://api.flutterwave.com/v3';
function validAppOrigin() { try { const u = new URL(APP_ORIGIN); return u.origin === APP_ORIGIN && u.protocol === 'https:'; } catch { return false; } }

const safeEq = (a: string, b: string) => { const aa = Buffer.from(a); const bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb); };
const json = async (r: Response) => r.json().catch(() => ({})) as Promise<Record<string, any>>;

export function billingConfig() { return { plans: { monthly: { amount: MONTHLY_AMOUNT, currency: CURRENCY, days: MONTHLY_DAYS }, yearly: { amount: YEARLY_AMOUNT, currency: CURRENCY, days: YEARLY_DAYS } }, configured: !!FLW_SECRET && !!FLW_WEBHOOK_HASH && validAppOrigin() && Number.isFinite(MONTHLY_AMOUNT) && MONTHLY_AMOUNT > 0 && Number.isFinite(YEARLY_AMOUNT) && YEARLY_AMOUNT > 0 && /^[A-Z]{3}$/.test(CURRENCY) }; }
function assertConfigured() { if (!billingConfig().configured) throw new Error('Billing requires Flutterwave secret, webhook hash, app origin, a valid price/currency and Premium duration on the server.'); }
async function flw(path: string, init?: RequestInit) { const res = await fetch(`${api}${path}`, { ...init, headers: { Authorization: `Bearer ${FLW_SECRET}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(18_000) }); const body = await json(res); if (!res.ok || body.status !== 'success') throw new Error(typeof body.message === 'string' ? body.message : 'Flutterwave request failed.'); return body; }
// Token claim is in epoch SECONDS (what the app and billingStatus read); `untilMs` is epoch milliseconds.
const claimToMs = (v: unknown) => { const n = Number(v ?? 0); return !n ? 0 : n > 1e11 ? n : n * 1000; }; // tolerate claims written in ms
function premiumClaims(untilMs: number) { return { premium: true, pothubPro: true, pothubPlan: 'pro', plan: 'pro', pothubProUntil: Math.floor(untilMs / 1000) }; }
async function activate(uid: string, txRef: string, txId: string, amount: number, currency: string) {
  const now = Date.now(); const ref = db().doc(`billingTransactions/${txRef}`); const userRef = db().doc(`billingUsers/${uid}`);
  await db().runTransaction(async t => { const snap = await t.get(ref); const billingUser = await t.get(userRef); const d = snap.data(); if (!d || d.uid !== uid) throw new Error('Payment record could not be verified.'); if (d.status === 'verified') return; const existingUntil = billingUser.data()?.premiumUntil instanceof Timestamp ? (billingUser.data()?.premiumUntil as Timestamp).toMillis() : 0; const base = Math.max(now, existingUntil); const details = planDetails(d.plan === 'yearly' ? 'yearly' : 'monthly'); const until = base + details.days * 86400000; t.update(ref, { status: 'verified', transactionId: txId, verifiedAmount: amount, verifiedCurrency: currency, verifiedAt: Timestamp.fromMillis(now), premiumUntil: Timestamp.fromMillis(until), premiumPlan: d.plan === 'yearly' ? 'yearly' : 'monthly', expiresAt: FieldValue.delete() }); t.set(userRef, { plan: 'pro', premiumUntil: Timestamp.fromMillis(until), updatedAt: Timestamp.fromMillis(now) }, { merge: true }); });
  const fresh = await ref.get(); const txData = fresh.data(); if (txData?.status !== 'verified' || txData?.uid !== uid) throw new Error('Payment record could not be verified.');
  const fallbackDays = planDetails(txData.premiumPlan === 'yearly' ? 'yearly' : 'monthly').days; const until = txData.premiumUntil instanceof Timestamp ? txData.premiumUntil.toMillis() : now + fallbackDays * 86400000;
  const user = await getAuth(adminApp()).getUser(uid); const existingClaimUntil = claimToMs(user.customClaims?.pothubProUntil); await getAuth(adminApp()).setCustomUserClaims(uid, { ...(user.customClaims ?? {}), ...premiumClaims(Math.max(until, existingClaimUntil)) });
  return { premium: true, premiumUntil: new Date(until).toISOString() };
}
async function verifyAndActivate(uid: string, transactionId: string, txRef?: string) {
  assertConfigured(); if (!/^\d{5,20}$/.test(transactionId)) throw new Error('Invalid transaction ID.');
  const body = await flw(`/transactions/${encodeURIComponent(transactionId)}/verify`); const data = body.data ?? {};
  const ref = String(data.tx_ref ?? ''); if (txRef && ref !== txRef) throw new Error('Transaction reference does not match.');
  const snap = await db().doc(`billingTransactions/${ref}`).get(); const expected = snap.data();
  if (!expected || expected.uid !== uid) throw new Error('Payment record not found for this account.');
  if (data.status !== 'successful' || String(data.currency).toUpperCase() !== String(expected.currency ?? CURRENCY).toUpperCase() || Number(data.amount) < Number(expected.amount)) throw new Error('Payment is not successful or does not match the expected amount/currency.');
  return activate(uid, ref, transactionId, Number(data.amount), String(data.currency).toUpperCase());
}
export async function startCheckout(who: Identity, requestedPlan?: unknown) {
  assertConfigured(); const plan = parsePlan(requestedPlan); const details = planDetails(plan); if (!who.email || !who.emailVerified) throw new Error('Verify your email address before purchasing Premium.');
  const txRef = `PH-${randomUUID()}`; const now = Date.now(); const tx = db().doc(`billingTransactions/${txRef}`);
  await tx.create({ uid: who.uid, email: who.email, plan, days: details.days, amount: details.amount, currency: CURRENCY, status: 'pending', createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + 45 * 60 * 1000) });
  const response = await flw('/payments', { method: 'POST', body: JSON.stringify({ tx_ref: txRef, amount: details.amount, currency: CURRENCY, redirect_url: `${APP_ORIGIN}/#/billing?payment=return`, customer: { email: who.email }, customizations: { title: 'Pothub Pro', description: `Pothub Pro ${details.label} access for ${details.days} days` }, configuration: { session_duration: 30, max_retry_attempt: 3 }, payment_options: 'card, banktransfer, ussd' }) });
  const link = response.data?.link; if (typeof link !== 'string') throw new Error('Flutterwave did not return a valid checkout link.'); const checkoutUrl = new URL(link); if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.flutterwave.com') throw new Error('Flutterwave returned an unexpected checkout host.'); await tx.update({ checkoutUrl: link }); return { checkoutUrl: link, txRef, amount: details.amount, currency: CURRENCY, plan, days: details.days };
}
export async function verifyCheckout(who: Identity, body: { transactionId?: unknown; txRef?: unknown }) { const transactionId = String(body.transactionId ?? ''); const txRef = typeof body.txRef === 'string' ? body.txRef : undefined; return verifyAndActivate(who.uid, transactionId, txRef); }
export async function billingStatus(who: Identity) { const snap = await db().doc(`billingUsers/${who.uid}`).get(); const d = snap.data(); const until = d?.premiumUntil instanceof Timestamp ? d.premiumUntil.toMillis() : 0; const active = d?.plan === 'pro' && until > Date.now(); let claimActive = false; let claimUntil = 0; try { const user = await getAuth(adminApp()).getUser(who.uid); const claims = user.customClaims ?? {}; claimUntil = claimToMs(claims.pothubProUntil); claimActive = (claims.premium === true || claims.pothubPro === true || claims.plan === 'pro' || claims.pothubPlan === 'pro') && (!claimUntil || claimUntil > Date.now()); } catch { /* Billing record remains authoritative. */ } const premium = active || claimActive; const expiry = active ? until : claimActive ? claimUntil || null : null; return { plan: premium ? 'pro' : 'free', premium, premiumUntil: expiry ? new Date(expiry).toISOString() : null, plans: billingConfig().plans, configured: billingConfig().configured }; }
export async function handleWebhook(body: Record<string, any>, signature: string | undefined) {
  assertConfigured(); if (!FLW_WEBHOOK_HASH || !signature || !safeEq(signature, FLW_WEBHOOK_HASH)) throw new Error('Invalid webhook signature.');
  const data = body.data ?? {}; const id = String(data.id ?? ''); const ref = String(data.tx_ref ?? ''); if (body.event !== 'charge.completed' || data.status !== 'successful' || !id || !ref || !/^\d{5,20}$/.test(id)) return { ignored: true };
  const snap = await db().doc(`billingTransactions/${ref}`).get(); const d = snap.data(); if (!d || d.status === 'verified') return { ignored: true };
  // Webhook payload is only a signal. Verification fetches the transaction directly from Flutterwave.
  return verifyAndActivate(String(d.uid), id, ref);
}
