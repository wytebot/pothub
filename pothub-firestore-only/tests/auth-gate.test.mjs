import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');

test('workspace UI is gated until authentication is resolved and a user exists', () => {
  assert.match(app, /if\(!authReady\)return <main className="auth-gate-screen"/);
  assert.match(app, /if\(!user\)return <main className="auth-gate-screen"/);
  assert.match(app, /No guest access/);
});

test('Google authentication supports browser popup with redirect fallback and restores its result without blocking startup', () => {
  assert.match(app, /signInWithPopup\(firebaseAuth,provider\)/);
  assert.match(app, /signInWithRedirect\(firebaseAuth,provider\)/);
  assert.match(app, /getRedirectResult\(firebaseAuth\)/);
  assert.match(app, /onAuthStateChanged\(firebaseAuth/);
  assert.match(app, /authFallback=setTimeout/);
  assert.match(app, /Continue with Google/);
});

test('GitHub authorization navigates to the backend OAuth endpoint instead of relying on a blocked popup', () => {
  assert.match(app, /window\.location\.href=target/);
  assert.match(app, /\/auth\/github\?deviceId=/);
  assert.match(app, /Continue with GitHub/);
});

test('developer and creator workspace roles are selectable and persist across browser reloads', () => {
  assert.match(app, /pothub_workspace_role/);
  assert.match(app, /chooseWorkspaceRole/);
  assert.match(app, /role-choice.*Developer/s);
  assert.match(app, /role-choice.*Creator/s);
  assert.match(app, /Change workspace/);
});

test('creator role gets a separate creator-first navigation and cannot navigate into developer-only pages', () => {
  assert.match(app, /workspaceRole==='creator'\?\[\['creator','Creator studio'/);
  assert.match(app, /workspaceRole==='creator'&&!\['creator','credits','history','settings','help'\]\.includes\(p\)/);
  assert.match(app, /workspaceRole==='developer'&&<button className=\{`nav-item/);
});
