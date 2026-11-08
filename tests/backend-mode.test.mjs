import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/ui/vercel/AiBackendTab.jsx', import.meta.url), 'utf8');
const mode = fs.readFileSync(new URL('../src/lib/backend-mode.js', import.meta.url), 'utf8');
const agents = fs.readFileSync(new URL('../src/lib/agents.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');

test('backend-only mode filters every agent lookup to Vercel Backend agents', () => {
  assert.match(app, /const backendOnly=await backendModeEnabled\(\);const pool=backendOnly\?pickBackendAgents\(rows\):rows/);
  assert.match(mode, /ticked\.length\?ticked:all/);
  assert.match(mode, /isBackendAgent=a=>String\(a\?\.label\|\|''\)===BACKEND_LABEL/);
});

test('direct API agents cannot be added or tested while backend-only is on', () => {
  assert.match(app, /Vercel backend only is on, so direct API agents are paused/);
  assert.match(app, /Vercel backend only is on, so direct API agents are not called/);
});

test('several Vercel Backend AIs can be ticked at once', () => {
  assert.match(agents, /input\.multi&&a\.label===agent\.label/);
  assert.match(page, /toggleDefault/);
  assert.match(page, /type="checkbox" checked=\{!!a\.default\}/);
  assert.match(page, /addBackendAi/);
});

test('the redirect card is gone and the callback URL is hard-coded', () => {
  assert.ok(!page.includes('vb-callback-guide'));
  assert.match(server, /HARDCODED_VERCEL_REDIRECT_URI='https:\/\/pothub-self\.vercel\.app\/api\/vercel\/callback'/);
});

test('GitHub repo discovery compares the token with the linked GitHub id', () => {
  assert.match(server, /linkedGithubUserId:s\.linkedAccounts\?\.github\?\.id/);
});
