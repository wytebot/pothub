import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GithubAuthProvider } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(config).every(Boolean);
export const firebaseApp = firebaseConfigured
  ? (getApps().length ? getApps()[0] : initializeApp(config))
  : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export function createGitHubProvider() {
  const provider = new GithubAuthProvider();
  provider.addScope('repo');
  provider.addScope('read:user');
  provider.addScope('user:email');
  provider.setCustomParameters({ allow_signup: 'true' });
  return provider;
}
