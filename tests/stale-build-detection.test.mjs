import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isStaleBuild } from '../src/lib/version-check.js';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('a bundle is stale only when both ids are known and differ', () => {
  assert.equal(isStaleBuild('dpl_2', 'dpl_1'), true);
  assert.equal(isStaleBuild('dpl_1', 'dpl_1'), false);
  assert.equal(isStaleBuild('', 'dpl_1'), false);
  assert.equal(isStaleBuild('dpl_2', ''), false);
});

test('client bundle and /api/version compare matching deployment or commit identifiers', async () => {
  const cfg = await read('next.config.mjs');
  const app = await read('server/app.js');
  const expr = 'process.env.VERCEL_DEPLOYMENT_ID';
  assert.match(cfg, /NEXT_PUBLIC_BUILD_ID: BUILD_ID/);
  assert.match(cfg, /const DEPLOYMENT_ID = process\.env\.VERCEL_DEPLOYMENT_ID/);
  assert.match(cfg, /const GIT_COMMIT_SHA = process\.env\.VERCEL_GIT_COMMIT_SHA \|\| process\.env\.GITHUB_SHA/);
  assert.match(cfg, /NEXT_PUBLIC_DEPLOYMENT_ID: DEPLOYMENT_ID/);
  assert.match(cfg, /NEXT_PUBLIC_GIT_COMMIT_SHA: GIT_COMMIT_SHA/);
  assert.match(app, /app\.get\('\/api\/version'/);
  assert.match(app, /VERCEL_DEPLOYMENT_ID\|\|process\.env\.VERCEL_GIT_COMMIT_SHA\|\|process\.env\.GITHUB_SHA/);
  assert.ok(cfg.includes(expr));
});

test('stale builds refresh automatically at most once per server build and never in the native APK', async () => {
  const notice = await read('src/ui/DeploymentUpdateNotice.jsx');
  const lib = await read('src/lib/version-check.js');
  assert.match(notice, /isNativeApp\(\)/);
  assert.match(notice, /mayAutoReload\(serverBuild\)/);
  assert.match(lib, /pothub-build-reload/);
  assert.match(lib, /key\.startsWith\('pothub-'\)/);
  assert.match(notice, /hardRefresh\(\)/);
});
