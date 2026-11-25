import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { adminApp } from './adminApp';
import { billingStatus } from './billing';
import type { Identity } from './identity';
export const FREE_ANALYSIS_LIMIT = 10;
export const ANALYSIS_COOLDOWN_MS = 5 * 60 * 60 * 1000;
const db = () => getFirestore(adminApp());
export type AnalysisQuota = { premium: boolean; used: number; limit: number | null; remaining: number | null; resetAt: string | null };
const view = (premium: boolean, used: number, resetAt: number | null): AnalysisQuota => premium ? { premium: true, used: 0, limit: null, remaining: null, resetAt: null } : { premium: false, used, limit: FREE_ANALYSIS_LIMIT, remaining: Math.max(0, FREE_ANALYSIS_LIMIT - used), resetAt: resetAt ? new Date(resetAt).toISOString() : null };
export async function consumeAnalysisQuota(who: Identity): Promise<AnalysisQuota> {
  const billing = await billingStatus(who); if (billing.premium) return view(true, 0, null);
  const ref = db().doc(`analysisQuota/${who.uid}`);
  return db().runTransaction(async tx => {
    const now = Date.now(); const snap = await tx.get(ref); const d = snap.data() ?? {};
    const resetAt = Number(d.resetAt ?? 0); const expired = !Number.isFinite(resetAt) || resetAt <= now;
    const used = expired ? 0 : Math.max(0, Math.min(FREE_ANALYSIS_LIMIT, Math.floor(Number(d.used ?? 0))));
    if (used >= FREE_ANALYSIS_LIMIT) throw Object.assign(new Error('ANALYSIS_QUOTA_REACHED'), { quota: view(false, used, resetAt) });
    const next = used + 1; const nextReset = next >= FREE_ANALYSIS_LIMIT ? now + ANALYSIS_COOLDOWN_MS : resetAt || null;
    tx.set(ref, { used: next, resetAt: nextReset, updatedAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + ANALYSIS_COOLDOWN_MS * 2) });
    return view(false, next, nextReset);
  });
}
