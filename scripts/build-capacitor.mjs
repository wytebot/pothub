import { access, copyFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = path.join(root, 'next.config.mjs');
const apiRoute = path.join(root, 'pages', 'api', '[...path].js');
const savedConfig = path.join(root, '.next.config.capacitor-backup.mjs');
const savedApi = path.join(root, '.next-api-route.capacitor-backup.js');
const worker = path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
const workerTarget = path.join(root, 'public', 'pdf.worker.mjs');
let configBackedUp = false;
let apiBackedUp = false;
let exitCode = 0;

try {
  await access(worker, constants.R_OK);
  await copyFile(worker, workerTarget);
  const stamp = spawnSync(process.execPath, [path.join(root, 'scripts', 'stamp-service-worker.mjs')], { cwd: root, stdio: 'inherit' });
  if (stamp.status !== 0) throw new Error('Could not stamp service worker for Capacitor build.');

  await rename(config, savedConfig); configBackedUp = true;
  await writeFile(config, `const nextConfig = { output: 'export', trailingSlash: false, images: { unoptimized: true }, poweredByHeader: false, reactStrictMode: true };\nexport default nextConfig;\n`);
  await rename(apiRoute, savedApi); apiBackedUp = true;
  const build = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'build'], { cwd: root, stdio: 'inherit', env: process.env });
  exitCode = build.status ?? 1;
} catch (error) {
  console.error(`[Capacitor build] ${error.message}`);
  exitCode = 1;
} finally {
  if (apiBackedUp) {
    await rm(apiRoute, { force: true });
    await rename(savedApi, apiRoute);
  }
  if (configBackedUp) {
    await rm(config, { force: true });
    await rename(savedConfig, config);
  }
}

if (exitCode !== 0) process.exit(exitCode);
console.log('Capacitor static frontend exported to out/. API calls use NEXT_PUBLIC_API_BASE; server API routes are restored in source.');
