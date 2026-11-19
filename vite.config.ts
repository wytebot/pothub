import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// One id per build (the Vercel commit when there is one). The page, the service worker and /version.json all carry it,
// so a device that still holds an older copy notices at once and replaces it.
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 10) || String(Date.now());
const versioning = () => ({
  name: 'pothub-versioning',
  apply: 'build' as const,
  closeBundle() {
    writeFileSync('dist/version.json', JSON.stringify({ id: BUILD_ID, builtAt: new Date().toISOString() }));
    if (existsSync('dist/sw.js')) writeFileSync('dist/sw.js', readFileSync('dist/sw.js', 'utf8').split('__BUILD_ID__').join(BUILD_ID));
  },
});

export default defineConfig({
  plugins: [react(), versioning()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  test: { environment: 'node' },
});
