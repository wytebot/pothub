import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { adminApp } from './adminApp';
import { billingStatus } from './billing';
import type { Identity } from './identity';

export const FREE_FILE_LIMIT = 30;
export const FILE_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
const db = () => getFirestore(adminApp());
export interface FileQuotaStatus { premium: boolean; used: number; limit: number | null; remaining: number | null; resetAt: string | null; windowMs: number; }
export function quotaView(premium: boolean, used: number, started: number, now = Date.now()): FileQuotaStatus {
  if (premium) return { premium: true, used: 0, limit: null, remaining: null, resetAt: null, windowMs: FILE_QUOTA_WINDOW_MS };
  const expired = started <= 0 || now >= started + FILE_QUOTA_WINDOW_MS;
  const normalizedUsed = expired ? 0 : Math.max(0, Math.min(FREE_FILE_LIMIT, Math.floor(used)));
  const resetAt = normalizedUsed > 0 ? started + FILE_QUOTA_WINDOW_MS : null;
  return { premium: false, used: normalizedUsed, limit: FREE_FILE_LIMIT, remaining: Math.max(0, FREE_FILE_LIMIT - normalizedUsed), resetAt: resetAt ? new Date(resetAt).toISOString() : null, windowMs: FILE_QUOTA_WINDOW_MS };
}
export async function fileQuotaStatus(who: Identity): Promise<FileQuotaStatus> {
  const premium = (await billingStatus(who)).premium;
  if (premium) return quotaView(true, 0, 0);
  const snap = await db().doc(`fileAnalysisQuota/${who.uid}`).get(); const d = snap.data() ?? {};
  const started = Number(d.windowStartedAt ?? 0); const last = Number(d.lastUsedAt ?? started); const used = Number(d.used ?? 0); const now = Date.now();
  if (!Number.isFinite(last) || !Number.isFinite(used) || last <= 0 || now >= last + FILE_QUOTA_WINDOW_MS) return quotaView(false, 0, 0, now);
  return quotaView(false, used, last, now);
}
export async function consumeFileQuota(who: Identity, count: number): Promise<FileQuotaStatus> {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('Choose between 1 and 20 files per message.');
  const premium = (await billingStatus(who)).premium;
  if (premium) return quotaView(true, 0, 0);
  const ref = db().doc(`fileAnalysisQuota/${who.uid}`);
  return db().runTransaction(async (tx) => {
    const now = Date.now(); const snap = await tx.get(ref); const d = snap.data() ?? {};
    const previousStart = Number(d.windowStartedAt ?? 0); const previousLast = Number(d.lastUsedAt ?? previousStart); const expired = !Number.isFinite(previousLast) || previousLast <= 0 || now >= previousLast + FILE_QUOTA_WINDOW_MS;
    const start = expired ? now : previousStart; const used = expired ? 0 : Math.max(0, Math.min(FREE_FILE_LIMIT, Math.floor(Number(d.used ?? 0))));
    if (used + count > FREE_FILE_LIMIT) throw Object.assign(new Error('FILE_QUOTA_REACHED'), { quota: quotaView(false, used, expired ? start : previousLast, now) });
    const next = used + count;
    tx.set(ref, { windowStartedAt: start, lastUsedAt: now, used: next, updatedAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(start + FILE_QUOTA_WINDOW_MS + 24 * 60 * 60 * 1000) });
    return quotaView(false, next, now, now);
  });
}
