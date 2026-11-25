import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

// One id per build (the Vercel commit when there is one). The page, the service worker and /version.json all carry it,
// so a device that still holds an older copy notices at once and replaces it.
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 10) || String(Date.now());
const APP_VERSION: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
const versioning = () => ({
  name: 'pothub-versioning',
  apply: 'build' as const,
  closeBundle() {
    writeFileSync('dist/version.json', JSON.stringify({ id: BUILD_ID, builtAt: new Date().toISOString() }));
    if (existsSync('dist/sw.js')) {
      // every built file the app needs, so it can open fully offline after the first visit (the largest files are fetched on use instead)
      const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = `${dir}/${f}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
      const files = existsSync('dist/assets') ? walk('dist/assets').filter((p) => statSync(p).size < 6 * 1024 * 1024 && !/\.(map|mp4|webm)$/.test(p)).map((p) => `/${p.slice('dist/'.length)}`) : [];
      writeFileSync('dist/sw.js', readFileSync('dist/sw.js', 'utf8').split('__BUILD_ID__').join(BUILD_ID).replace('/*__PRECACHE__*/[]', JSON.stringify(files)));
    }
  },
});


// Vite exposes every VITE_* variable to the browser. Refuse to build when a secret-looking name uses that prefix.
// (Lives here, not in scripts/, so the build can never fail because a helper file is missing from Git.)
const FORBIDDEN = /(?:SECRET|PRIVATE|PASSWORD|TOKEN|CREDENTIAL|SERVICE_ACCOUNT|ENCRYPTION_KEY|WEBHOOK_HASH|API_KEY|ACCESS_KEY|(?:OPENAI|GEMINI|ANTHROPIC|FLUTTERWAVE|STRIPE|PAYPAL).*KEY|(?:^|_)KEY$)/i;
const PUBLIC_OK = new Set([
  'VITE_POTHUB_WEB_PUSH_VAPID_KEY',
  // Firebase Web API keys identify the Firebase project; they are public client config, not Admin credentials.
  'VITE_FIREBASE_API_KEY',
]);
const publicEnvGuard = () => ({
  name: 'pothub-public-env-guard',
  apply: 'build' as const,
  buildStart() {
    const keys = new Set(Object.keys(process.env));
    for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
      if (!existsSync(file)) continue;
      for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (m) keys.add(m[1]);
      }
    }
    const bad = [...keys].filter((k) => k.startsWith('VITE_') && !PUBLIC_OK.has(k) && FORBIDDEN.test(k));
    if (bad.length) throw new Error(`Refusing to build: private-looking environment variables use the public VITE_ prefix: ${bad.join(', ')}`);
  },
});

export default defineConfig({
  plugins: [react(), publicEnvGuard(), versioning()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __APP_VERSION__: JSON.stringify(APP_VERSION) },
  test: { environment: 'node' },
});
