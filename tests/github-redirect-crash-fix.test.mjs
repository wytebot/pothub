import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('GitHub click redirects independently of Firebase and local IndexedDB persistence', async () => {
  const ui = await read('src/ui/App.jsx');
  const login = ui.slice(ui.indexOf('async function login(provider)'), ui.indexOf('async function logout()'));
  assert.match(login, /if\(provider==='github'\)/);
  assert.match(login, /Could not persist preferred role before GitHub redirect/);
  assert.match(login, /window\.location\.assign\(target\)/);
  assert.ok(login.indexOf("if(provider==='github')") < login.indexOf("if(user&&role!=='Creator')await logout()"));
  assert.match(login, /\/api\/auth\/github/);
});

test('GitHub authorization start requires client ID but defers client-secret validation to callback', async () => {
  const route = await read('pages/api/auth/github.js');
  assert.match(route, /if \(!clientId\)/);
  assert.match(route, /client secret is only required after GitHub returns to the callback/);
  assert.match(route, /https:\/\/github\.com\/login\/oauth\/authorize/);
});

test('global crash fallback exposes a copyable error diagnostic instead of hiding the exception', async () => {
  const app = await read('pages/_app.jsx');
  assert.match(app, /getDerivedStateFromError\(error\)/);
  assert.match(app, /Error details/);
  assert.match(app, /Copy error details/);
  assert.match(app, /componentDidCatch\(error, info\)/);
});
