import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');

test('workspace UI is gated until authentication is resolved and a user exists', () => {
  assert.match(app, /if\(!authReady\)return <main className="auth-gate-screen"/);
  assert.match(app, /if\(!user\)return <main className="auth-gate-screen"/);
  assert.match(app, /No guest access/);
});

test('Google authentication uses Firebase redirect flow and restores its result', () => {
  assert.match(app, /signInWithRedirect\(firebaseAuth,provider\)/);
  assert.match(app, /getRedirectResult\(firebaseAuth\)/);
  assert.match(app, /Continue with Google/);
});

test('GitHub authorization navigates to the backend OAuth endpoint instead of relying on a blocked popup', () => {
  assert.match(app, /window\.location\.assign\(target\)/);
  assert.match(app, /\/auth\/github\?deviceId=/);
  assert.match(app, /Continue with GitHub/);
});
