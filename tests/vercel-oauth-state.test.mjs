import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { signOAuthState, verifyOAuthState } from '../server/oauth-state.js';

test('signed OAuth state verifies only while valid and unmodified', () => {
  const secret = 'test-secret-that-is-long-enough-for-state-signing';
  const payload = { state: 'abc123', verifier: 'pkce-verifier', createdAt: Date.now() };
  const signed = signOAuthState(payload, secret);
  assert.deepEqual(verifyOAuthState(signed, secret), payload);
  assert.equal(verifyOAuthState(`${signed}x`, secret), null);
  assert.equal(verifyOAuthState(signed, 'different-secret-that-is-also-long-enough'), null);
});

test('Vercel auth routes use explicit Next handlers and HMAC state, not dynamic iron state imports', () => {
  const start = fs.readFileSync(new URL('../pages/api/vercel/connect.js', import.meta.url), 'utf8');
  const callback = fs.readFileSync(new URL('../pages/api/vercel/callback.js', import.meta.url), 'utf8');
  const repos = fs.readFileSync(new URL('../pages/api/github/repos.js', import.meta.url), 'utf8');
  assert.match(start, /signOAuthState/);
  assert.match(callback, /verifyOAuthState/);
  assert.doesNotMatch(start + callback, /await import\(['"]@hapi\/iron['"]\)/);
  assert.match(repos, /api\.github\.com\/user\/repos/);
  assert.match(repos, /requestId/);
});

test('repository and Vercel diagnostic endpoints are isolated from the Express catch-all', () => {
  const nextConfig = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
  const routes = [
    '../pages/api/github/repos.js',
    '../pages/api/vercel/connect.js',
    '../pages/api/vercel/callback.js',
    '../pages/api/vercel/[...action].js',
  ].map(path => fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
  assert.match(nextConfig, /"framework":\s*"nextjs"/);
  assert.match(routes[0], /await import\('\.\.\/\.\.\/\.\.\/server\/lib\.js'\)/);
  assert.match(routes[1], /vercel\.com\/oauth\/authorize/);
  assert.match(routes[2], /vercel\.com\/login\/oauth\/token/);
  assert.match(routes[3], /action === 'projects'/);
  assert.match(routes[3], /action === 'deployments'/);
  assert.match(routes[3], /action === 'logs'/);
  assert.match(routes.join('\n'), /requestId/);
});
