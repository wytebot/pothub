const BLOCKED_EXACT = new Set(['.env', '.env.local', '.env.production', '.env.development']);
const BLOCKED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.next', 'out', 'vendor']);
const SECRET_NAME = /(?:^|[._-])(secret|credential|private[._-]?key)(?:$|[._-])/i;

/** Repository-relative path policy. Directory exclusions are segment-anchored, so `src/distance.js` remains eligible. */
export function isExcludedRepoPath(value, { allowBuildFiles = false } = {}) {
  const path = String(value || '').replace(/\\/g, '/');
  if (!path || path.startsWith('/') || path.includes('\0')) return true;
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return true;
  const name = parts.at(-1) || '';
  if (BLOCKED_EXACT.has(name.toLowerCase()) || /^\.env(?:\.|$)/i.test(name)) return true;
  if (SECRET_NAME.test(name)) return true;
  if (!allowBuildFiles && parts.some(part => BLOCKED_DIRS.has(part.toLowerCase()))) return true;
  return false;
}

export function assertSafeRepoPath(path, options) {
  if (isExcludedRepoPath(path, options)) throw Object.assign(new Error('This repository path is blocked by PotHub safety rules.'), { status: 422, code: 'UNSAFE_REPO_PATH' });
  return String(path).replace(/\\/g, '/');
}
