import { getAuth } from 'firebase-admin/auth';
import { adminApp, hasFirebaseCredentials } from './adminApp';

export interface Identity { uid: string; email?: string; emailVerified: boolean; }
/** Verifies a Firebase ID token sent by the app (Authorization: Bearer <idToken>). Returns null for anything invalid. */
export async function verifyIdToken(header: string | undefined): Promise<Identity | null> {
  const token = (header ?? '').replace(/^Bearer /, '').trim();
  if (!token || !hasFirebaseCredentials()) return null;
  try { const d = await getAuth(adminApp()).verifyIdToken(token, true); return { uid: d.uid, email: d.email, emailVerified: d.email_verified === true }; } catch { return null; }
}
