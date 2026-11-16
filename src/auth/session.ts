import { Capacitor } from '@capacitor/core';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut as fbSignOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from '../firebase';

export interface Me { uid: string; name: string; email: string; photo: string; }
const toMe = (u: User | null): Me | null => (u ? { uid: u.uid, name: u.displayName ?? '', email: u.email ?? '', photo: u.photoURL ?? '' } : null);

const MESSAGES: Record<string, string> = {
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.',
  'auth/popup-closed-by-user': '',
  'auth/cancelled-popup-request': '',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/unauthorized-domain': 'This web address is not authorised for sign-in yet. Add it under Firebase Console > Authentication > Settings > Authorised domains.',
  'auth/operation-not-allowed': 'Google sign-in is switched off. Enable the Google provider in Firebase Console > Authentication > Sign-in method.',
  'auth/account-exists-with-different-credential': 'This email is already registered with a different sign-in method.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
};
const codeOf = (e: unknown): string => {
  const x = e as { code?: unknown; message?: unknown };
  if (typeof x?.code === 'string') return x.code;
  const m = String(x?.message ?? '');
  return /cancel|dismiss|12501/i.test(m) ? 'cancelled' : m;
};
export type SignInResult = { ok: true } | { ok: false; message: string };

/**
 * One tap, no page redirect:
 *  - Browser: Google account popup (signInWithPopup).
 *  - Android APK: native Google account sheet; the returned idToken signs the Firebase JS SDK in.
 * A closed or dismissed chooser returns { ok:false, message:'' } so the UI stays quiet.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const r = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
      const idToken = r.credential?.idToken;
      if (!idToken) throw Object.assign(new Error('no id token'), { code: 'auth/missing-token' });
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken, r.credential?.accessToken));
    } else {
      const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, p);
    }
    return { ok: true };
  } catch (e) {
    const c = codeOf(e);
    if (c in MESSAGES) return { ok: false, message: MESSAGES[c] };
    if (c === 'cancelled') return { ok: false, message: '' };
    if (c === 'auth/missing-token') return { ok: false, message: 'Google did not return a sign-in token. Check that the app SHA-1 is registered in Firebase and google-services.json is current.' };
    if (/DEVELOPER_ERROR|developer error|ApiException: 10/i.test(String((e as Error)?.message))) return { ok: false, message: 'Google rejected this build (developer error). Add this build\'s SHA-1 fingerprint in Firebase Console > Project settings > Android app, download a fresh google-services.json and rebuild.' };
    return { ok: false, message: 'Sign-in did not complete. Try again.' };
  }
}

export async function signOut() {
  await fbSignOut(auth).catch(() => {});
  if (Capacitor.isNativePlatform()) { try { const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication'); await FirebaseAuthentication.signOut(); } catch { /* ignore */ } }
}

/** Fresh ID token for calling the Pothub server. Never stored by the app. */
export async function idToken(): Promise<string | null> { try { return (await auth.currentUser?.getIdToken()) ?? null; } catch { return null; } }
export const currentMe = (): Me | null => toMe(auth.currentUser);

/** undefined = still restoring the saved session (render nothing that flickers), null = signed out. */
export function useMe(): Me | null | undefined {
  const [me, setMe] = useState<Me | null | undefined>(() => (auth.currentUser ? toMe(auth.currentUser) : undefined));
  useEffect(() => onAuthStateChanged(auth, (u) => setMe(toMe(u))), []);
  return me;
}
