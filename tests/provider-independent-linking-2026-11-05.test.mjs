import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
const workspace = fs.readFileSync(new URL('../src/ui/WorkspaceSection.jsx', import.meta.url), 'utf8');
const frontend = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
test('GitHub linking uses a one-time account ticket and preserves the current provider identity', () => {
  assert.match(app, /app\.post\('\/api\/github\/link-ticket'/);
  assert.match(app, /linkAuthProvider:linkRequested\?String\(existing\.authProvider\|\|'pothub'\)/);
  assert.match(app, /authProvider:String\(stateData\.linkAuthProvider\|\|'pothub'\)/);
  assert.match(frontend, /api\('\/api\/github\/link-ticket'/);
});
test('Vercel linking supports any authenticated PotHub provider through a one-time ticket', () => {
  assert.match(app, /app\.post\('\/api\/vercel\/link-ticket'/);
  assert.match(app, /if\(req\.query\.link_ticket\)/);
  assert.match(app, /authProvider:String\(session\.authProvider\|\|'pothub'\)/);
  assert.match(app, /Your PotHub session changed during Vercel authorization/);
  assert.match(app, /new URL\('https:\/\/vercel\.com\/oauth\/authorize'\)/);
  assert.match(app, /new URL\('https:\/\/github\.com\/login\/oauth\/authorize'\)/);
  assert.match(workspace, /api\('\/api\/vercel\/link-ticket'/);
});
