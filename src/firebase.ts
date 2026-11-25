import { Capacitor } from '@capacitor/core';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, browserPopupRedirectResolver, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';

/** Firebase web configuration is public application metadata. Server credentials remain server-only. */
const host = typeof window !== 'undefined' ? window.location.hostname : '';
// Chrome's partitioned storage can break Firebase redirect sign-in when the app
// and auth helper use different domains. The Vercel deployment proxies /__/auth
// to Firebase, so use the app's own host as authDomain for the installed PWA.
const redirectAuthDomain = host === 'pothub-self.vercel.app'
  ? host
  : 'pothub-ca2a1.firebaseapp.com';
export const firebaseConfig = {
  apiKey: 'AIzaSyArzD6DL51vblo79g4J6WwHunULfIedIDU',
  authDomain: redirectAuthDomain,
  projectId: 'pothub-ca2a1',
  storageBucket: 'pothub-ca2a1.firebasestorage.app',
  messagingSenderId: '518294365386',
  appId: '1:518294365386:web:0b474d247f090081c5c033',
  measurementId: 'G-ENNT86P1KD',
};

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// In the Android WebView the popup/redirect resolver does not exist, so auth is created without it and only
// receives credentials from the native Google picker. In browsers the resolver MUST be passed explicitly:
// initializeAuth() (unlike getAuth()) does not add it, and without it signInWithRedirect()/getRedirectResult()
// throw auth/argument-error, so Google sign-in never even leaves the page.
export const auth: Auth = (() => {
  // Explicit local persistence keeps Google sign-in across browser/PWA restarts;
  // Firebase restores it automatically and refreshes tokens until revoked/expired.
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      ...(Capacitor.isNativePlatform() ? {} : { popupRedirectResolver: browserPopupRedirectResolver }),
    });
  } catch { return getAuth(app); }
})();

/** Analytics is optional and web-only; it must never break startup (blocked by privacy tools, http, native WebView). */
export function startAnalytics() {
  if (Capacitor.isNativePlatform()) return;
  void (async () => {
    try {
      const { getAnalytics, isSupported } = await import('firebase/analytics');
      if (await isSupported()) getAnalytics(app);
    } catch { /* ignore */ }
  })();
}
