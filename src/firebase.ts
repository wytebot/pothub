import { Capacitor } from '@capacitor/core';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';

/** Public web-app identifiers (safe to ship; access is controlled by Firebase rules and authorised domains). Override with VITE_FIREBASE_*. */
const env = import.meta.env as Record<string, string | undefined>;
const host = typeof window !== 'undefined' ? window.location.hostname : '';
// Chrome's partitioned storage can break Firebase redirect sign-in when the app
// and auth helper use different domains. The Vercel deployment proxies /__/auth
// to Firebase, so use the app's own host as authDomain for the installed PWA.
const redirectAuthDomain = host === 'pothub-self.vercel.app'
  ? host
  : (env.VITE_FIREBASE_AUTH_DOMAIN ?? 'pothub-ca2a1.firebaseapp.com');
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'AIzaSyArzD6DL51vblo79g4J6WwHunULfIedIDU',
  authDomain: redirectAuthDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'pothub-ca2a1',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? 'pothub-ca2a1.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '518294365386',
  appId: env.VITE_FIREBASE_APP_ID ?? '1:518294365386:web:0b474d247f090081c5c033',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-ENNT86P1KD',
};

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// In the Android WebView the popup/redirect resolver does not exist, so auth is created without it and only
// receives credentials from the native Google picker. In browsers getAuth() wires the popup resolver.
export const auth: Auth = (() => {
  // Explicit local persistence keeps Google sign-in across browser/PWA restarts;
  // Firebase restores it automatically and refreshes tokens until revoked/expired.
  try { return initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }); }
  catch { return getAuth(app); }
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
