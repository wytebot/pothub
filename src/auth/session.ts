import { Capacitor } from '@capacitor/core';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithRedirect, getRedirectResult, signOut as fbSignOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from '../firebase';

export interface Me { uid: string; name: string; email: string; photo: string; }
const toMe = (u: User | null): Me | null => (u ? { uid: u.uid, name: u.displayName ?? '', email: u.email ?? '', photo: u.photoURL ?? '' } : null);

const MESSAGES: Record<string, string> = {
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.',
  'auth/internal-error': 'Sign-in did not complete. Try again.',
  'auth/popup-closed-by-user': '',
  'auth/cancelled-popup-request': '',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/unauthorized-domain': 'Google sign-in is not enabled for this site yet. Please contact support.',
  'auth/operation-not-allowed': 'Google sign-in is temporarily unavailable. Please contact support.',
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
 * Browser: Google's account list opens in a pop-up the moment the button is pressed (always asking which account),
 * and falls back to a full-page redirect only if the browser cannot open pop-ups.
 * Android: the native Google account list, whose token is handed to Firebase.
 * A dismissed account list returns a quiet cancellation.
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
      // Use a top-level browser navigation instead of a popup. This is reliable in
      // mobile browsers/PWAs where popup windows may be silently suppressed.
      const p = new GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      await signInWithRedirect(auth, p);
      // The browser leaves this page; Firebase completes the session on return.
      return { ok: true };
    }
    return { ok: true };
  } catch (e) {
    const c = codeOf(e);
    if (c in MESSAGES) return { ok: false, message: MESSAGES[c] };
    if (c === 'cancelled') return { ok: false, message: '' };
    if (c === 'auth/missing-token') return { ok: false, message: 'Google did not complete sign-in. Please try again or update the app.' };
    if (/DEVELOPER_ERROR|developer error|ApiException: 10/i.test(String((e as Error)?.message))) return { ok: false, message: 'Google sign-in is not available in this version of the app. Please update the app or contact support.' };
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
  useEffect(() => {
    // Only the browser can return from a redirect; the Android app has no redirect step.
    if (!Capacitor.isNativePlatform()) void getRedirectResult(auth).catch((error: unknown) => {
      const code = codeOf(error);
      const message = code in MESSAGES ? MESSAGES[code] : 'Google sign-in could not be completed. Please try again.';
      if (message) { sessionStorage.setItem('auth.redirectError', message); window.dispatchEvent(new Event('auth:redirect-error')); }
    });
    return onAuthStateChanged(auth, (u) => setMe(toMe(u)));
  }, []);
  return me;
}
