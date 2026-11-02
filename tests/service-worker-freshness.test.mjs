import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../pages/index.jsx', import.meta.url), 'utf8');
const stamp = await readFile(new URL('../scripts/stamp-service-worker.mjs', import.meta.url), 'utf8');

test('service worker network-only for documents, APIs, auth and Next chunks', () => {
  assert.match(sw, /fetch\(request, \{ cache: 'no-store' \}\)/);
  assert.match(sw, /isAuthOrApiPath\(url\.pathname\)/);
  assert.match(sw, /url\.pathname\.startsWith\('\/_next\/static\/'\)\) \{ return; \}/);
  assert.match(sw, /cache\.delete\(request\)/);
});

test('browser/PWA checks for deployment updates when returning to foreground', () => {
  assert.match(page, /registration\.update\(\)/);
  assert.match(page, /addEventListener\('focus', checkForUpdate\)/);
  assert.match(page, /addEventListener\('visibilitychange', checkForUpdate\)/);
  assert.match(page, /Capacitor\.isNativePlatform\(\)/);
});

test('each build stamps a unique deployment cache key and disables worker script HTTP cache', () => {
  assert.match(stamp, /VERCEL_DEPLOYMENT_ID/);
  assert.match(stamp, /const CACHE = '[^']*';/);
});

test('deployment update notice is mounted and compares live deployment/commit IDs', async () => {
  const app = await readFile(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
  const version = await readFile(new URL('../src/lib/version-check.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../server/app.js', import.meta.url), 'utf8');
  assert.match(app, /import DeploymentUpdateNotice from '\.\/DeploymentUpdateNotice'/);
  assert.match(app, /<DeploymentUpdateNotice\/>/);
  assert.match(version, /cache: 'no-store'/);
  assert.match(version, /CLIENT_DEPLOYMENT \? \(data\?\.deployment/);
  assert.match(server, /no-store, no-cache, private, max-age=0, must-revalidate/);
  assert.match(server, /commit:String\(process\.env\.VERCEL_GIT_COMMIT_SHA/);
});

test('HTML shell, service worker and manifest explicitly disable HTTP caching', async () => {
  const next = await readFile(new URL('../next.config.mjs', import.meta.url), 'utf8');
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  assert.match(next, /source: '\/sw\.js'.*no-store, no-cache/s);
  assert.match(next, /source: '\/manifest\.webmanifest'.*no-store, no-cache/s);
  assert.match(vercel, /"source": "\/sw\.js"[\s\S]*?"value": "no-cache, no-store, must-revalidate"/);
});
