import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project sites live under /<repo>/. Derive it from the Actions environment
// (GITHUB_REPOSITORY=owner/repo) so renaming the repo cannot break asset URLs; override with
// GITHUB_PAGES_BASE if needed. Falls back to /pothub/ for local `GITHUB_PAGES=true` builds.
const githubPages = process.env.GITHUB_PAGES === 'true';
const repoName = String(process.env.GITHUB_REPOSITORY || '').split('/')[1];
const rawBase = process.env.GITHUB_PAGES_BASE || (repoName ? `/${repoName}/` : '/pothub/');
const pagesBase = `/${rawBase.replace(/^\/+|\/+$/g, '')}/`;
const base = githubPages ? pagesBase : '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: { '/api': 'http://localhost:8787' },
  },
});
