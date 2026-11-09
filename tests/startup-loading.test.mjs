import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('home page gives a stalled app bundle a visible retry instead of infinite loading', async () => {
  const source = await readFile(new URL('../pages/index.jsx', import.meta.url), 'utf8');
  assert.match(source, /setTimeout\(\(\) => reject/);
  assert.match(source, /45000/);
  assert.match(source, /Pothub could not load/);
  assert.match(source, /Retry loading Pothub/);
  assert.match(source, /Your saved workspace data has not been cleared/);
});
