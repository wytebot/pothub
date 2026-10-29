import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const file = new URL('../public/sw.js', import.meta.url);
let buildId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
if (!buildId) { try { buildId = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {} }
if (!buildId) buildId = `build-${Date.now()}`;
const source = await readFile(file, 'utf8');
const safeId = buildId.replace(/[^a-zA-Z0-9._-]/g, '');
const stamped = source.replace(/const BUILD_ID = '[^']*';/, `const BUILD_ID = '${safeId}';`).replace(/const CACHE = 'pothub-shell-v6[^']*';/, `const CACHE = 'pothub-shell-v6-${safeId}';`);
await writeFile(file, stamped);
console.log(`Stamped service worker build ${buildId}`);
