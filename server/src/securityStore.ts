import { createHash } from 'node:crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { adminApp } from './adminApp';
const db = () => getFirestore(adminApp());
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
/** Shared rate-limit counter. Caller falls back to process-local limits if Firebase is not configured. */
export async function distributedLimit(key: string, max: number, windowMs = 60_000) {
  const ref = db().doc(`rateLimits/${digest(key)}`);
  return db().runTransaction(async (tx) => {
    const now = Date.now(); const snap = await tx.get(ref); const d = snap.data() ?? {};
    const start = Number(d.start ?? now); const expired = now - start >= windowMs; const count = expired ? 0 : Number(d.count ?? 0);
    if (count >= max) return true;
    tx.set(ref, { start: expired ? now : start, count: count + 1, expiresAt: Timestamp.fromMillis(now + windowMs * 2) }); return false;
  });
}
