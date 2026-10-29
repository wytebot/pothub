import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Public Firebase Web SDK configuration for Pothub. These values identify the
// Firebase project and are intended to be included in browser builds; security
// must be enforced with Firebase Auth/Firestore rules and server-side IAM.
const config = {
  apiKey: "AIzaSyArzD6DL51vblo79g4J6WwHunULfIedIDU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "pothub-ca2a1.firebaseapp.com",
  projectId: "pothub-ca2a1",
  storageBucket: "pothub-ca2a1.firebasestorage.app",
  messagingSenderId: "518294365386",
  appId: "1:518294365386:web:0b474d247f090081c5c033",
  measurementId: "G-ENNT86P1KD",
};

export const firebaseConfigured = true;
export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(config);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseConfig = Object.freeze({ ...config });
