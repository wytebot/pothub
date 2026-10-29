import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Must match the base computed in vite.config.js.
const repoName = String(process.env.GITHUB_REPOSITORY || '').split('/')[1];
const rawBase = process.env.GITHUB_PAGES_BASE || (repoName ? `/${repoName}/` : '/pothub/');
const base = `/${rawBase.replace(/^\/+|\/+$/g, '')}/`;

const dist = join(process.cwd(), 'dist');
const manifestPath = join(dist, 'manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const prefix = src => (src.startsWith(base) ? src : src.replace(/^\//, base));
manifest.id = base;
manifest.start_url = base;
manifest.scope = base;
manifest.icons = (manifest.icons || []).map(icon => ({ ...icon, src: prefix(icon.src) }));
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Configured Pothub static manifest for GitHub Pages at ${base}.`);
