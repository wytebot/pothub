import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import bundled from './firebase-config.json';

// Firebase web config is public by design (it identifies the project; security comes from
// Firebase Auth rules and authorized domains), so it is committed in firebase-config.json.
// VITE_FIREBASE_* variables, if set, override the file.
const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || bundled.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || bundled.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || bundled.projectId,
  appId: env.VITE_FIREBASE_APP_ID || bundled.appId,
};

export const firebaseConfigured = Object.values(config).every(v => v && !String(v).startsWith('PASTE_'));
export const firebaseApp = firebaseConfigured
  ? (getApps().length ? getApps()[0] : initializeApp(config))
  : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
