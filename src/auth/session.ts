import { Capacitor } from '@capacitor/core';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithRedirect, getRedirectResult, signOut as fbSignOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { captureFromSignIn, DRIVE_SCOPE } from '../cloud/token';

export interface Me { uid: string; name: string; email: string; photo: string; }
const toMe = (u: User | null): Me | null => (u ? { uid: u.uid, name: u.displayName ?? '', email: u.email ?? '', photo: u.photoURL ?? '' } : null);

const MESSAGES: Record<string, string> = {
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.',
  'auth/internal-error': 'Sign-in did not complete. Try again.',
  'auth/popup-closed-by-user': '',
  'auth/cancelled-popup-request': '',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/unauthorized-domain': 'Google sign-in is not enabled for this site yet. Add pothub-self.vercel.app to Firebase Authorized domains and add its /__/auth/handler URL to the Google OAuth client.',
  'auth/invalid-api-key': 'Firebase rejected this app configuration. Check the Firebase web app API key.',
  'auth/operation-not-supported-in-this-environment': 'This browser could not start Google sign-in. Open Pothub in Chrome and try again.',
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
 * PWA/browser: use a full-page Firebase redirect so the Google account chooser
 * opens in the current standalone window. The Vercel /__/auth proxy keeps the
 * helper on the app's origin, avoiding Chrome's third-party storage partitioning.
 * Android: keep the native Google account picker and exchange its token with Firebase.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const r = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true, scopes: [DRIVE_SCOPE] });
      const idToken = r.credential?.idToken;
      if (!idToken) throw Object.assign(new Error('no id token'), { code: 'auth/missing-token' });
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken, r.credential?.accessToken));
      void captureFromSignIn(r.credential?.accessToken, auth.currentUser?.email ?? '');
    } else {
      // Use a top-level browser navigation instead of a popup. This is reliable in
      // mobile browsers/PWAs where popup windows may be silently suppressed.
      const p = new GoogleAuthProvider();
      p.addScope(DRIVE_SCOPE); // the private Pothub folder in the person's own Drive, used to carry their work to other devices
      p.setCustomParameters({ prompt: 'select_account' });
      sessionStorage.setItem('auth.redirectPending', '1');
      await signInWithRedirect(auth, p);
      // The browser leaves this page; Firebase completes the session on return.
      return { ok: true };
    }
    return { ok: true };
  } catch (e) {
    if (!Capacitor.isNativePlatform()) sessionStorage.removeItem('auth.redirectPending');
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

let redirectResultTask: Promise<void> | null = null;

function publishRedirectError(message: string) {
  sessionStorage.removeItem('auth.redirectPending');
  sessionStorage.setItem('auth.redirectError', message);
  window.dispatchEvent(new Event('auth:redirect-error'));
}

function resolveBrowserRedirectOnce() {
  if (redirectResultTask) return redirectResultTask;
  redirectResultTask = getRedirectResult(auth).then((result) => {
    if (result?.user) void captureFromSignIn(GoogleAuthProvider.credentialFromResult(result)?.accessToken, result.user.email ?? '');
    const wasPending = sessionStorage.getItem('auth.redirectPending') === '1';
    sessionStorage.removeItem('auth.redirectPending');
    if (wasPending && !result?.user && !auth.currentUser) {
      publishRedirectError('Google returned without completing sign-in. Please try again.');
    }
  }).catch((error: unknown) => {
    if (sessionStorage.getItem('auth.redirectPending') !== '1') return; // offline or nothing to finish: not an error worth showing
    const code = codeOf(error);
    const message = code in MESSAGES ? MESSAGES[code] : 'Google sign-in could not be completed. Please try again.';
    publishRedirectError(message || 'Google sign-in was cancelled.');
  });
  return redirectResultTask;
}

/** undefined = briefly restoring the saved session; null = signed out. */
export function useMe(): Me | null | undefined {
  const [me, setMe] = useState<Me | null | undefined>(() => (auth.currentUser ? toMe(auth.currentUser) : undefined));
  useEffect(() => {
    let active = true;
    let resolved = false;
    // Never leave the installed PWA on an indefinite black spinner if redirect
    // state cannot be restored (for example, stale browser storage or no network).
    const fallback = window.setTimeout(() => {
      if (active && !resolved) {
        resolved = true;
        setMe(null);
      }
      if (sessionStorage.getItem('auth.redirectPending') === '1') {
        publishRedirectError('Google sign-in is taking too long to return. Check your connection and try again.');
      }
    }, 5000);
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      resolved = true;
      window.clearTimeout(fallback);
      setMe(toMe(u));
    });
    // Only browsers return from Firebase's redirect handler; Android uses native credentials.
    if (!Capacitor.isNativePlatform()) void resolveBrowserRedirectOnce();
    return () => {
      active = false;
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, []);
  return me;
}
