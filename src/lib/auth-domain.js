/**
 * PotHub uses the Firebase-provisioned auth handler. The app's Vercel hostname is
 * the OAuth return destination, not the Firebase authDomain, unless an operator
 * explicitly configures a custom domain that actually proxies /__/auth transparently.
 */
export function authDomainForHost(_hostname, _configured = '') {
  return 'pothub-ca2a1.firebaseapp.com';
}
export function validGithubRepositoryName(value) {
  const name = String(value || '').trim();
  return name.length >= 1 && name.length <= 100 && /^[A-Za-z0-9_.-]+$/.test(name) && name !== '.' && name !== '..' && !name.toLowerCase().endsWith('.git');
}
export function validGitBranchRef(value) {
  const branch = String(value || '');
  return branch.length >= 1 && branch.length <= 250 && /^[A-Za-z0-9_.\/-]+$/.test(branch) && !branch.split('/').some(part => !part || part === '.' || part === '..');
}
