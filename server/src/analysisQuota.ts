import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { adminApp } from './adminApp';
import { billingStatus } from './billing';
import type { Identity } from './identity';
export const FREE_ANALYSIS_LIMIT = 30;
export const ANALYSIS_WINDOW_MS = 24 * 60 * 60 * 1000;
const db = () => getFirestore(adminApp());
export type AnalysisQuota = { premium: boolean; used: number; limit: number | null; remaining: number | null; resetAt: string | null };
const view = (premium: boolean, used: number, last: number, now = Date.now()): AnalysisQuota => premium ? { premium: true, used: 0, limit: null, remaining: null, resetAt: null } : { premium: false, used, limit: FREE_ANALYSIS_LIMIT, remaining: Math.max(0, FREE_ANALYSIS_LIMIT - used), resetAt: used ? new Date(last + ANALYSIS_WINDOW_MS).toISOString() : null };
export async function consumeAnalysisQuota(who: Identity): Promise<AnalysisQuota> {
  if ((await billingStatus(who)).premium) return view(true, 0, 0);
  const ref = db().doc(`analysisQuota/${who.uid}`);
  return db().runTransaction(async tx => {
    const now = Date.now(); const snap = await tx.get(ref); const d = snap.data() ?? {};
    const last = Number(d.lastUsedAt ?? 0); const expired = !Number.isFinite(last) || last <= 0 || now >= last + ANALYSIS_WINDOW_MS;
    const used = expired ? 0 : Math.max(0, Math.min(FREE_ANALYSIS_LIMIT, Math.floor(Number(d.used ?? 0))));
    if (used >= FREE_ANALYSIS_LIMIT) throw Object.assign(new Error('ANALYSIS_QUOTA_REACHED'), { quota: view(false, used, last, now) });
    const next = used + 1; tx.set(ref, { used: next, lastUsedAt: now, updatedAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + ANALYSIS_WINDOW_MS + 24 * 60 * 60 * 1000) });
    return view(false, next, now, now);
  });
}
