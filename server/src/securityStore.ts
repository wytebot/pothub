import { createHash } from 'node:crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { adminApp } from './adminApp';
import { FREE_LIMITS, type UsageKind } from './securityPolicy';

const db = () => getFirestore(adminApp());
const day = () => new Date().toISOString().slice(0, 10);
const digest = (s: string) => createHash('sha256').update(s).digest('hex');

export async function reserveUsage(uid: string, kind: UsageKind, amount: number, premium: boolean) {
  const ref = db().doc(`usageCounters/${digest(uid)}_${day()}`);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.data() ?? { uidHash: digest(uid), day: day(), image: 0, video: 0 }) as Record<string, number | string>;
    const used = Number(current[kind] ?? 0);
    const limit = FREE_LIMITS[kind];
    if (!premium && used + amount > limit) return { allowed: false as const, used, limit, remaining: Math.max(0, limit - used), resetsAt: new Date(`${day()}T24:00:00.000Z`).toISOString() };
    tx.set(ref, { ...current, uidHash: digest(uid), day: day(), [kind]: used + amount, updatedAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 400 * 24 * 60 * 60_000) }, { merge: true });
    return { allowed: true as const, used: used + amount, limit: premium ? null : limit, remaining: premium ? null : Math.max(0, limit - used - amount), premium };
  });
}


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

export async function readUsage(uid: string) {
  const snap = await db().doc(`usageCounters/${digest(uid)}_${day()}`).get();
  const d = snap.data() ?? {};
  return { image: Number(d.image ?? 0), video: Number(d.video ?? 0), day: day() };
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
