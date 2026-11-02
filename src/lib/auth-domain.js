/**
 * Firebase Auth domain selection.
 *
 * signInWithRedirect only returns a user reliably when the Firebase auth handler is
 * served from the SAME origin as the app. Chrome/Android PWAs, TWAs and WebView-based
 * APKs partition third-party storage, so a handler on *.firebaseapp.com cannot hand the
 * result back to a *.vercel.app page ("Google returned to PotHub without an authenticated
 * account"). vercel.json proxies /__/auth/* to the Firebase handler, so on any real public
 * host the page's own host is used as authDomain. Local/IP/dev hosts keep the Firebase one.
 *
 * A custom proxy domain may still be forced with NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, but a
 * firebaseapp.com / web.app value is ignored because it is exactly what breaks the redirect.
 */
export const FIREBASE_HANDLER_DOMAIN = 'pothub-ca2a1.firebaseapp.com';
function cleanHost(value) {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');
}
function isLocalHost(host) {
  return !host || host === 'localhost' || host.endsWith('.localhost') || host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}
export function authDomainForHost(hostname = '', configured = '') {
  const explicit = cleanHost(configured);
  if (explicit && !/(^|\.)(firebaseapp\.com|web\.app)$/.test(explicit)) return explicit;
  const host = cleanHost(hostname);
  return isLocalHost(host) ? FIREBASE_HANDLER_DOMAIN : host;
}
export function validGithubRepositoryName(value) {
  const name = String(value || '').trim();
  return name.length >= 1 && name.length <= 100 && /^[A-Za-z0-9_.-]+$/.test(name) && name !== '.' && name !== '..' && !name.toLowerCase().endsWith('.git');
}
export function validGitBranchRef(value) {
  const branch = String(value || '');
  return branch.length >= 1 && branch.length <= 250 && /^[A-Za-z0-9_.\/-]+$/.test(branch) && !branch.split('/').some(part => !part || part === '.' || part === '..');
}
