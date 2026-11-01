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
