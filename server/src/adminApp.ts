import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';

export const hasFirebaseCredentials = () => !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);
/** One shared Admin app for Firestore and for verifying Firebase sign-in tokens. */
export function adminApp(): App {
  return getApps()[0] ?? initializeApp({ credential: process.env.FIREBASE_SERVICE_ACCOUNT ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) : applicationDefault() });
}
