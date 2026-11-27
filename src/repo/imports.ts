// Finds the repository files a source file imports (relative imports only). Free of imports so it is cheap to test.
const EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '/index.ts', '/index.tsx', '/index.js', '/index.mjs'];
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;

const join = (dir: string, rel: string): string => {
  const out = dir ? dir.split('/') : [];
  for (const part of rel.split('/')) { if (part === '.' || part === '') continue; if (part === '..') out.pop(); else out.push(part); }
  return out.join('/');
};

export function importsOf(path: string, source: string, repoPaths: Set<string>): string[] {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const found = new Set<string>();
  for (const m of source.matchAll(SPEC)) {
    const base = join(dir, m[1].replace(/\?.*$/, ''));
    const hit = EXT.map((e) => base + e).find((p) => repoPaths.has(p));
    if (hit) found.add(hit);
  }
  return [...found];
}

/** Paths that never help a diagnosis (dependencies, build output, lock files, binaries). */
export const IGNORED = /(?:^|\/)(?:node_modules|dist|build|\.next|\.vercel|coverage|android\/app\/build)\/|(?:^|\/)\.env(?:\.[^/]+)?$|(?:^|\/)(?:credentials?|secrets?|service-account(?:-key)?|id_rsa|id_ed25519)(?:\.[^/]*)?$|(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.lock)$|\.(?:png|jpe?g|gif|webp|ico|svg|pdf|zip|mp[34]|woff2?|ttf|otf|keystore|pem|key|p12|pfx|crt|cer|asc|gpg|pgp|jar|patch)$/i;
export const CONFIG_FILES = ['package.json', 'vercel.json', 'tsconfig.json', 'tsconfig.app.json', 'vite.config.ts', 'vite.config.js', 'next.config.js', 'next.config.mjs', 'next.config.ts', '.npmrc', 'capacitor.config.ts'];
