import { createHmac, timingSafeEqual } from 'node:crypto';

export type Plan = 'monthly' | 'annual';
export const PRICE_USD: Record<Plan, number> = { monthly: 3, annual: 36 };

/** Flutterwave v4 signs the RAW body: base64(HMAC-SHA256(rawBody, secretHash)) in `flutterwave-signature`. */
export function verifySignature(raw: Buffer, header: string | undefined, secretHash: string): boolean {
  if (!header) return false;
  const a = Buffer.from(createHmac('sha256', secretHash).update(raw).digest('base64')); const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
/** Rounds UP to the nearest `step` naira so we never under-charge. */
export const ngnAmount = (usd: number, rate: number, step = 10) => Math.ceil((usd * rate) / step) * step;
export function addPeriod(from: Date, plan: Plan): Date { const d = new Date(from); d.setUTCMonth(d.getUTCMonth() + (plan === 'annual' ? 12 : 1)); return d; }
export function luhn(n: string): boolean {
  if (!/^\d{12,19}$/.test(n)) return false; let s = 0;
  for (let i = 0; i < n.length; i++) { let d = Number(n[n.length - 1 - i]); if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; }
  return s % 10 === 0;
}

export interface Sub { customerKey: string; email?: string; plan: Plan; status: 'active' | 'expired'; currentPeriodEnd: string; lastReference: string; amountNgn?: number; }
export interface Pending { txRef: string; customerKey: string; email: string; plan: Plan; amountNgn: number; claimHash: string; chargeId?: string; createdAt: number; }
export interface Payment { reference: string; customerKey: string; amount: number; currency: string; at?: string; }
export interface Store {
  seenEvent(id: string): Promise<boolean>; markEvent(id: string): Promise<void>;
  getSub(key: string): Promise<Sub | undefined>; findSubByEmail(email: string): Promise<Sub | undefined>; putSub(s: Sub): Promise<void>;
  /** Atomically records a payment. Returns false if that reference was already recorded. */
  addPayment(p: Payment): Promise<boolean>; listPayments(customerKey: string): Promise<Payment[]>;
  getPending(txRef: string): Promise<Pending | undefined>; putPending(p: Pending): Promise<void>; deletePending(txRef: string): Promise<void>;
  /** Signed-in Google account (Firebase uid) -> billing customer, so a licence can be restored on a new device. */
  getLink(uid: string): Promise<string | undefined>; putLink(uid: string, customerKey: string): Promise<void>;
}
export interface BillingEvent { id: string; reference: string; customerKey: string; plan: Plan; amount: number; currency: string; email?: string; amountNgn?: number; }

/** Extends access for one verified payment, exactly once. Access is prepaid for a fixed period; nothing renews automatically. */
export async function applyPayment(store: Store, ev: BillingEvent, now = new Date()): Promise<'applied' | 'duplicate'> {
  if (await store.seenEvent(ev.id)) return 'duplicate';
  const sub = await store.getSub(ev.customerKey);
  if (!(await store.addPayment({ reference: ev.reference, customerKey: ev.customerKey, amount: ev.amount, currency: ev.currency }))) { await store.markEvent(ev.id); return 'duplicate'; }
  const from = sub && new Date(sub.currentPeriodEnd) > now ? new Date(sub.currentPeriodEnd) : now; // paying early adds time, it never wastes paid days
  await store.putSub({ customerKey: ev.customerKey, email: ev.email ?? sub?.email, plan: ev.plan, status: 'active', currentPeriodEnd: addPeriod(from, ev.plan).toISOString(), lastReference: ev.reference, amountNgn: ev.amountNgn });
  await store.markEvent(ev.id); return 'applied';
}
export const entitled = (s: Sub | undefined, now = new Date()) => !!s && new Date(s.currentPeriodEnd) > now;

export interface Tx { id: string; status: 'successful' | 'failed' | 'pending'; amount: number; currency: string; reference: string; }
/** Turns a charge that was re-fetched from Flutterwave into entitlement. Never call with webhook-only data. */
export async function settleCharge(store: Store, tx: Tx, now = new Date()): Promise<{ result: 'applied' | 'duplicate' | 'ignored'; reason?: string; customerKey?: string }> {
  const pending = await store.getPending(tx.reference);
  if (!pending) return { result: 'ignored', reason: 'unknown payment' };
  if (tx.currency !== 'NGN') return { result: 'ignored', reason: 'unexpected currency' };
  if (tx.status === 'pending') return { result: 'ignored', reason: 'not successful', customerKey: pending.customerKey };
  if (tx.status === 'failed') return { result: 'ignored', reason: 'payment failed', customerKey: pending.customerKey };
  if (tx.amount < pending.amountNgn) return { result: 'ignored', reason: 'amount below expected price', customerKey: pending.customerKey };
  const result = await applyPayment(store, { id: `charge:${tx.id}`, reference: `flw:${tx.id}`, customerKey: pending.customerKey, plan: pending.plan, amount: tx.amount, currency: tx.currency, email: pending.email, amountNgn: pending.amountNgn }, now);
  await store.deletePending(tx.reference);
  return { result, customerKey: pending.customerKey };
}

export function memoryStore(): Store {
  const subs = new Map<string, Sub>(), pays = new Map<string, Payment>(), evs = new Set<string>(), pend = new Map<string, Pending>(), links = new Map<string, string>();
  return {
    seenEvent: async (i) => evs.has(i), markEvent: async (i) => void evs.add(i),
    getSub: async (k) => subs.get(k), findSubByEmail: async (e) => [...subs.values()].find((s) => s.email === e), putSub: async (s) => void subs.set(s.customerKey, s),
    addPayment: async (p) => { if (pays.has(p.reference)) return false; pays.set(p.reference, { ...p, at: new Date().toISOString() }); return true; },
    listPayments: async (k) => [...pays.values()].filter((p) => p.customerKey === k),
    getPending: async (t) => pend.get(t), putPending: async (p) => void pend.set(p.txRef, p), deletePending: async (t) => void pend.delete(t),
    getLink: async (u) => links.get(u), putLink: async (u, k) => void links.set(u, k),
  };
}
