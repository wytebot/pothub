/** Select Firebase's auth domain.
 * Browsers now partition/block third-party storage, which breaks signInWithRedirect when the
 * Firebase helper (…firebaseapp.com) is on a different origin than the app: Google returns to
 * the app but getRedirectResult() has no user. So the app's own host is used and /__/auth is
 * proxied same-origin (see vercel.json). Localhost and unknown Vercel preview hosts keep the
 * Firebase default, because their /__/auth/handler URL is not registered with Google.
 * Set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN to override, or add stable hosts to SAME_ORIGIN_HOSTS. */
const SAME_ORIGIN_HOSTS = ['pothub-self.vercel.app'];
export function authDomainForHost(hostname, configured = '') {
  if (configured) return configured;
  const host = String(hostname || '').toLowerCase();
  if (SAME_ORIGIN_HOSTS.includes(host)) return host;
  const local = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
  const preview = host.endsWith('.vercel.app') || host.endsWith('.vercel.dev');
  return host && !local && !preview ? host : 'pothub-ca2a1.firebaseapp.com';
}
export function validGithubRepositoryName(value) {
  const name = String(value || '').trim();
  return name.length >= 1 && name.length <= 100 && /^[A-Za-z0-9_.-]+$/.test(name) && name !== '.' && name !== '..' && !name.toLowerCase().endsWith('.git');
}
export function validGitBranchRef(value) {
  const branch = String(value || '');
  return branch.length >= 1 && branch.length <= 250 && /^[A-Za-z0-9_.\/-]+$/.test(branch) && !branch.split('/').some(part => !part || part === '.' || part === '..');
}
