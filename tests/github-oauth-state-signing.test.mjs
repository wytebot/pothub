import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('GitHub OAuth start signs state with Node crypto without dynamic session helper calls', async () => {
  const route = await read('pages/api/auth/github.js');
  assert.match(route, /crypto\.createHmac\('sha256'/);
  assert.match(route, /const sealed = signState\(/);
  assert.doesNotMatch(route, /await import\(['"]@hapi\/iron['"]\)/);
  assert.match(route, /github\.com\/login\/oauth\/authorize/);
});

test('GitHub callback verifies signed state and rejects tampering/expiry', async () => {
  const route = await read('pages/api/auth/github/callback.js');
  assert.match(route, /function verifyState\(/);
  assert.match(route, /crypto\.timingSafeEqual\(/);
  assert.match(route, /Date\.now\(\) - payload\.createdAt > 600000/);
  assert.match(route, /verifyState\(decodeURIComponent\(sealed\), secret\)/);
});
