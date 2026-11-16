import { adminApp } from './adminApp';
import { getFirestore } from 'firebase-admin/firestore';
import type { Payment, Pending, Store, Sub } from './billing';

/** Billing records only (subscriptions, payments, webhook ids, pending payments). Media never goes here. */
export function firestoreStore(): Store {
  const db = getFirestore(adminApp()); db.settings({ ignoreUndefinedProperties: true });
  const id = (s: string) => encodeURIComponent(s);
  return {
    seenEvent: async (e) => (await db.doc(`webhookEvents/${id(e)}`).get()).exists,
    markEvent: async (e) => void (await db.doc(`webhookEvents/${id(e)}`).set({ at: new Date().toISOString() })),
    getSub: async (k) => (await db.doc(`subscriptions/${id(k)}`).get()).data() as Sub | undefined,
    findSubByEmail: async (e) => (await db.collection('subscriptions').where('email', '==', e).limit(1).get()).docs[0]?.data() as Sub | undefined,
    putSub: async (s) => void (await db.doc(`subscriptions/${id(s.customerKey)}`).set(s)),
    addPayment: async (p) => { try { await db.doc(`payments/${id(p.reference)}`).create({ ...p, at: new Date().toISOString() }); return true; } catch (e) { if ((e as { code?: number }).code === 6) return false; throw e; } }, // 6 = ALREADY_EXISTS
    listPayments: async (k) => (await db.collection('payments').where('customerKey', '==', k).limit(100).get()).docs.map((d) => d.data() as Payment).sort((a, b) => String(b.at).localeCompare(String(a.at))),
    getPending: async (t) => (await db.doc(`pendingPayments/${id(t)}`).get()).data() as Pending | undefined,
    putPending: async (p) => void (await db.doc(`pendingPayments/${id(p.txRef)}`).set(p)),
    deletePending: async (t) => void (await db.doc(`pendingPayments/${id(t)}`).delete()),
    getLink: async (uid) => ((await db.doc(`accounts/${id(uid)}`).get()).data() as { customerKey?: string } | undefined)?.customerKey,
    putLink: async (uid, customerKey) => void (await db.doc(`accounts/${id(uid)}`).set({ customerKey, at: new Date().toISOString() })),
  };
}
