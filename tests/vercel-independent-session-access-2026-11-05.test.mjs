import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const lib = fs.readFileSync(new URL('../server/lib.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
test('Vercel OAuth sessions are accepted as independent PotHub sessions', () => {
  assert.match(lib, /!\['google','vercel'\]\.includes\(s\?\.authProvider\)/);
  assert.match(app, /if\(provider==='vercel'\)/);
  assert.match(app, /\/api\/auth\/vercel/);
});
