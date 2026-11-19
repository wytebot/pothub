import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

// One id per build (the Vercel commit when there is one). The page, the service worker and /version.json all carry it,
// so a device that still holds an older copy notices at once and replaces it.
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 10) || String(Date.now());
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

export default defineConfig({
  plugins: [react(), versioning()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  test: { environment: 'node' },
});
