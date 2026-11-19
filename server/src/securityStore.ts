import { createHash } from 'node:crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { adminApp } from './adminApp';

const db = () => getFirestore(adminApp());
const digest = (s: string) => createHash('sha256').update(s).digest('hex');

export async function getAccountRole(uid: string, adminUids: ReadonlySet<string>): Promise<'admin' | 'user'> {
  const ref = db().doc(`accountRoles/${digest(uid)}`);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // The deployment allowlist is authoritative; stale Firestore role values can never retain admin access.
    const role: 'admin' | 'user' = adminUids.has(uid) ? 'admin' : 'user';
    if (!snap.exists || snap.data()?.role !== role) tx.set(ref, { role, updatedAt: Timestamp.now() }, { merge: true });
    return role;
  });
}

export async function audit(uid: string | null, action: string, meta: Record<string, string | number | boolean | null> = {}) {
  // Deliberately exclude request bodies, credentials, payment-card data and raw IP addresses.
  await db().collection('securityAudit').add({ uidHash: uid ? digest(uid) : null, action, meta, at: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60_000) });
}

export async function distributedLimit(key: string, max: number, windowMs = 60_000) {
  const ref = db().doc(`rateLimits/${digest(key)}`);
  return db().runTransaction(async (tx) => {
    const now = Date.now(); const snap = await tx.get(ref); const d = snap.data() ?? {};
    const start = Number(d.start ?? now); const count = now - start >= windowMs ? 0 : Number(d.count ?? 0);
    if (count >= max) return true;
    tx.set(ref, { start: now - start >= windowMs ? now : start, count: count + 1, expiresAt: Timestamp.fromMillis(now + windowMs * 2) });
    return false;
  });
}

export function configuredAdmins(): Set<string> {
  return new Set(String(process.env.ADMIN_UIDS ?? '').split(',').map((x) => x.trim()).filter(Boolean));
}
