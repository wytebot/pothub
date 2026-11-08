import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const server = read('server/app.js');
const handler = (name) => { const i = server.indexOf(`app.post('${name}'`); return server.slice(i, server.indexOf('\napp.', i + 10)); };

test('GitHub disconnect revokes the whole grant, falls back to the session token, and reports the provider answer', () => {
  const h = handler('/api/github/disconnect');
  assert.match(h, /applications\/\$\{encodeURIComponent\(oauth\.clientId\)\}\/grant/);
  assert.match(h, /method:'DELETE'/);
  assert.match(h, /String\(s\.githubToken\|\|''\)/, 'session token is used when the stored row has none');
  assert.match(h, /revokeResponse\.status===204/);
  assert.match(h, /res\.json\(\{ok:true,connected:false,revoked/);
  assert.ok(h.indexOf('await ref.delete()') > h.indexOf('/grant'), 'local record is removed even when revocation fails');
});

test('Vercel disconnect revokes the refresh token and the access token and checks each answer', () => {
  const h = handler('/api/vercel/disconnect');
  assert.match(h, /\['refreshToken','accessToken'\]/);
  assert.match(h, /login\/oauth\/token\/revoke/);
  assert.match(h, /if\(r\.ok\)okCount\+\+/);
  assert.match(h, /revoked=okCount===tokens\.length/);
  assert.match(h, /vercelConnectionRef\(s\.user\.id\)\.delete\(\)/);
});

test('after a disconnect the next connect asks the provider to show the account chooser', () => {
  assert.match(server, /if\(req\.query\.reauth==='1'\)u\.searchParams\.set\('prompt','select_account'\)/);
  assert.match(server, /if\(req\.query\.reauth==='1'\)url\.searchParams\.set\('prompt','login'\)/);
  const app = read('src/ui/App.jsx'), ws = read('src/ui/WorkspaceSection.jsx');
  assert.match(app, /force-reauth-github/);
  assert.match(app, /force-reauth-\$\{provider\}/);
  assert.match(ws, /force-reauth-vercel/);
  assert.match(ws, /\$\{again\?'&reauth=1':''\}/);
});

test('Vercel authorize requests never send response_mode (Vercel only accepts web_message.opener and rejects query)', () => {
  assert.doesNotMatch(server, /response_mode/);
  assert.equal((server.match(/new URL\('https:\/\/vercel\.com\/oauth\/authorize'\)/g) || []).length, 2, 'sign-in and connect both build the authorize URL');
  assert.match(server, /response_type:'code',scope:'openid email profile offline_access'/);
});
