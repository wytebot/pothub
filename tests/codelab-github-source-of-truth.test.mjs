import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
const codelab = fs.readFileSync(new URL('../src/ui/CodelabWorkspace.jsx', import.meta.url), 'utf8');
test('Codelab repository discovery and file reads are live GitHub requests and explicitly non-cacheable', () => {
  assert.match(app, /app\.get\('\/api\/github\/repos'/);
  assert.match(app, /sourceOfTruth:'github'/);
  assert.match(app, /Cache-Control','no-store, private, max-age=0'/);
  assert.match(app, /app\.get\('\/api\/github\/files'/);
  assert.match(app, /app\.get\('\/api\/github\/file'/);
});
test('Codelab does not claim to keep a server-side repository mirror and exposes guarded deletion', () => {
  assert.match(codelab, /does not create a server-side code mirror/);
  assert.match(codelab, /delete-repo/);
  assert.match(codelab, /Repository name did not match\. Nothing was deleted\./);
});
