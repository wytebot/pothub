/** Select Firebase's auth domain. Custom production hosts should use the same-origin
 * /__/auth proxy; localhost and Vercel preview hosts keep the Firebase default. */
export function authDomainForHost(hostname, configured = '') {
  if (configured) return configured;
  const host = String(hostname || '').toLowerCase();
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
