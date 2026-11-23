import { Capacitor } from '@capacitor/core';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signInWithRedirect, getRedirectResult, signOut as fbSignOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from '../firebase';

export interface Me { uid: string; name: string; email: string; photo: string; }
const toMe = (u: User | null): Me | null => (u ? { uid: u.uid, name: u.displayName ?? '', email: u.email ?? '', photo: u.photoURL ?? '' } : null);

const MESSAGES: Record<string, string> = {
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before sign-in completed. Open it again and finish selecting your account.',
  'auth/internal-error': 'Google sign-in reached Firebase but failed internally. Check Firebase Authorized domains and the Google OAuth redirect URI for pothub-self.vercel.app, then retry.',
  'auth/popup-closed-by-user': '',
  'auth/cancelled-popup-request': '',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/unauthorized-domain': 'This website is not authorized for Google sign-in. In Firebase Authentication, add pothub-self.vercel.app under Authorized domains. In Google Cloud OAuth, ensure https://pothub-self.vercel.app/__/auth/handler is an authorized redirect URI for the web OAuth client.',
  'auth/argument-error': 'Google sign-in is not set up correctly in this build (missing redirect resolver). Please update the app.',
  'auth/web-storage-unsupported': 'This browser is blocking storage that sign-in needs. Allow cookies and site data for this site, or leave private mode, then try again.',
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
      const r = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
      const idToken = r.credential?.idToken;
      if (!idToken) throw Object.assign(new Error('no id token'), { code: 'auth/missing-token' });
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken, r.credential?.accessToken));
    } else {
      // A popup returns the Firebase credential immediately and avoids the mobile
      // redirect round-trip that was intermittently returning without a session.
      const p = new GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, p);
        return { ok: true };
      } catch (popupError) {
        const popupCode = codeOf(popupError);
        // If the browser explicitly blocks popups, use the redirect path as a
        // fallback. Cancellation and provider/config errors should not redirect.
        if (popupCode !== 'auth/popup-blocked') throw popupError;
        try { sessionStorage.setItem('auth.redirectPending', '1'); } catch { /* storage may be unavailable */ }
        await signInWithRedirect(auth, p);
        return { ok: true };
      }
    }
    return { ok: true };
  } catch (e) {
    if (!Capacitor.isNativePlatform()) { try { sessionStorage.removeItem('auth.redirectPending'); } catch { /* storage may be unavailable */ } }
    const c = codeOf(e);
    if (c in MESSAGES) return { ok: false, message: MESSAGES[c] };
    if (c === 'cancelled') return { ok: false, message: '' };
    if (c === 'auth/missing-token') return { ok: false, message: 'Google did not complete sign-in. Please try again or update the app.' };
    if (/DEVELOPER_ERROR|developer error|ApiException: 10/i.test(String((e as Error)?.message))) return { ok: false, message: 'Google sign-in is not available in this version of the app. Please update the app or contact support.' };
    console.error('[Pothub Google sign-in]', { code: c, message: e instanceof Error ? e.message : String(e) });
    return { ok: false, message: `Google sign-in failed (${c || 'unknown error'}). Check the Firebase authorized domain and Google OAuth redirect settings, then try again.` };
  }
}

export async function signOut() {
  await fbSignOut(auth).catch(() => {});
  if (Capacitor.isNativePlatform()) { try { const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication'); await FirebaseAuthentication.signOut(); } catch { /* ignore */ } }
}

/** Fresh ID token for calling the Pothub server. Never stored by the app. */
export async function idToken(): Promise<string | null> {
  // Wait for Firebase to finish restoring the saved sign-in first; reading currentUser too early made signed-in people look signed out.
  try { await Promise.race([auth.authStateReady(), new Promise((r) => setTimeout(r, 4000))]); } catch { /* carry on with what we have */ }
  try { return (await auth.currentUser?.getIdToken()) ?? null; } catch { return null; }
}
/** A random id this browser made for itself, for tools that work without an account (website tags, GitHub sign-in). Not a secret and not an identity. */
export function guestId(): string {
  try {
    let id = localStorage.getItem('pothub.guest.v1');
    if (!id || !/^[A-Za-z0-9_-]{22,64}$/.test(id)) { id = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 40); localStorage.setItem('pothub.guest.v1', id); }
    return id;
  } catch { return 'guest-session-' + Math.random().toString(36).slice(2, 14).padEnd(12, '0'); }
}
export const currentMe = (): Me | null => toMe(auth.currentUser);

let redirectResultTask: Promise<User | null> | null = null;

function publishRedirectError(message: string) {
  sessionStorage.removeItem('auth.redirectPending');
  sessionStorage.setItem('auth.redirectError', message);
  window.dispatchEvent(new Event('auth:redirect-error'));
}


function resolveBrowserRedirectOnce(): Promise<User | null> {
  if (redirectResultTask) return redirectResultTask;
  redirectResultTask = getRedirectResult(auth).then((result) => {
    const user = result?.user ?? auth.currentUser;
    if (user) sessionStorage.removeItem('auth.redirectPending');
    return user ?? null;
  }).catch((error: unknown) => {
    if (sessionStorage.getItem('auth.redirectPending') !== '1') return auth.currentUser;
    const code = codeOf(error);
    const message = code in MESSAGES ? MESSAGES[code] : 'Google sign-in could not be completed. Please try again.';
    publishRedirectError(message || 'Google sign-in was cancelled.');
    return auth.currentUser;
  });
  return redirectResultTask;
}


/** undefined = briefly restoring the saved session; null = signed out. */
export function useMe(): Me | null | undefined {
  const redirectPendingAtStart = !Capacitor.isNativePlatform() && sessionStorage.getItem('auth.redirectPending') === '1';
  const [me, setMe] = useState<Me | null | undefined>(() => (auth.currentUser ? toMe(auth.currentUser) : redirectPendingAtStart ? undefined : undefined));
  useEffect(() => {
    let active = true;
    let redirectResolved = !redirectPendingAtStart;
    let authResolved = false;
    // A redirect may take longer on mobile networks or when the Google account picker
    // returns through an external browser. Do not prematurely show the signed-out page.
    const fallback = window.setTimeout(() => {
      if (!active) return;
      if (!authResolved && !redirectPendingAtStart) setMe(toMe(auth.currentUser));
      if (redirectPendingAtStart && !redirectResolved && sessionStorage.getItem('auth.redirectPending') === '1') {
        publishRedirectError('Google sign-in did not return in time. Reopen Pothub and try again.');
        setMe(toMe(auth.currentUser));
      }
    }, redirectPendingAtStart ? 45_000 : 8_000);
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      authResolved = true;
      if (u) {
        redirectResolved = true;
        sessionStorage.removeItem('auth.redirectPending');
        setMe(toMe(u));
      } else if (!redirectPendingAtStart || redirectResolved) {
        setMe(null);
      }
    });
    if (!Capacitor.isNativePlatform()) {
      void resolveBrowserRedirectOnce().then((u) => {
        redirectResolved = true;
        if (!active) return;
        if (u) {
          sessionStorage.removeItem('auth.redirectPending');
          setMe(toMe(u));
        } else {
          // The redirect came back without a user (cancelled, or Back was pressed on Google's page).
          // Clear the pending flag and show the signed-out page instead of waiting for the 45 s timeout.
          sessionStorage.removeItem('auth.redirectPending');
          setMe(toMe(auth.currentUser));
        }
      });
    }
    return () => {
      active = false;
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, []);
  return me;
}
