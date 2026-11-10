import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Android startup diagnostic recognizes the Next.js mount node', async () => {
  const source = await readFile(new URL('../.github/wybuild/android-startup-diagnostics.js', import.meta.url), 'utf8');
  assert.match(source, /getElementById\('__next'\)\s*\|\|\s*document\.getElementById\('root'\)/);
  assert.match(source, /No visible app content after 15000 ms/);
});
