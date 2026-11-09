import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const client = fs.readFileSync(new URL('../src/ui/codelab/github.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server/wytelab-github.js', import.meta.url), 'utf8');

test('Codelab file open sends the file in filePath, not a query parameter named like the API catch-all route', () => {
  assert.match(client, /\/file\?filePath=\$\{encodeURIComponent\(p\)\}/);
  assert.doesNotMatch(client, /\/file\?path=/);
});

test('the server reads filePath first and ignores route-parameter values for the legacy path query', () => {
  assert.match(server, /searchParams\.get\("filePath"\)/);
  assert.match(server, /searchParams\.getAll\("path"\)/);
});
