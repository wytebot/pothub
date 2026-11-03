import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/lib/cloud-sync.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');

test('workspace sync never returns encrypted or plaintext agent secrets to the client', () => {
  assert.match(app, /delete data\.secretEncrypted;delete data\.secretPlain;delete data\.secret/);
  assert.match(app, /keyConfigured:!!data\.secretEncrypted/);
});

test('server request planner resolves agent IDs from the authenticated account registry', () => {
  assert.match(app, /if\(Array\.isArray\(parsed\?\.agentIds\)\)/);
  assert.match(app, /workspaceOwnerKey\(userId\)/);
  assert.match(app, /decryptWorkspaceSecret\(a\.secretEncrypted\)/);
  assert.match(app, /aWorkspace!==workspace\|\|aliases\[aTask\]!==task/);
});

test('creator and developer text/image flows send saved agent IDs rather than API keys', () => {
  assert.match(ui, /agentConfig:\{agentIds:selected\.map\(a=>a\.agentId\)\}/);
  assert.match(ui, /body:JSON\.stringify\(\{agentIds:\[a\.id\]\}\)/);
});

test('cloud sync preserves an existing local encrypted copy without requiring server plaintext', () => {
  assert.match(sync, /else if \(local\?\.secret\) row\.secret = local\.secret/);
  assert.match(sync, /delete row\.secretPlain/);
});
