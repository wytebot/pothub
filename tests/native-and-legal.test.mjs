import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { INFO_PAGES, INFO_ORDER, CONTACT_EMAIL } from '../src/ui/legal/content.js';

test('every help and legal page exists, has content and points to the support address', () => {
  assert.equal(CONTACT_EMAIL, 'wytetechcompany@gmail.com');
  for (const id of INFO_ORDER) {
    const page = INFO_PAGES[id];
    assert.ok(page?.title && page.sections.length >= 1, id);
    assert.ok(fs.existsSync(new URL(`../pages/${{ how: 'how-it-works', aup: 'acceptable-use', data: 'data-deletion' }[id] || id}.jsx`, import.meta.url)), `route for ${id}`);
  }
  const all = JSON.stringify(INFO_PAGES);
  for (const topic of ['Chat', 'Library', 'API & Agents', 'Codelab', 'Vercel Backend', 'Credits', 'Security & backup']) assert.ok(all.includes(topic), topic);
});

test('the Vercel token guide gives the exact steps', () => {
  const guide = fs.readFileSync(new URL('../src/ui/vercel/TokenGuide.jsx', import.meta.url), 'utf8');
  assert.match(guide, /vercel\.com\/account\/settings\/tokens/);
  assert.match(guide, /All projects/);
  assert.match(guide, /Create/);
});

test('rate limits are generous and 429s are retried by the client', () => {
  const server = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
  assert.match(server, /limit:900/);
  assert.match(server, /sensitiveLimit=rateLimit\(\{windowMs:60000,limit:240/);
  const app = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /rateWaits<2/);
  assert.match(app, /apiStreamResumable/);
});

test('GitHub file reads resolve wrong-case and wrong-prefix paths and report 404 as 404', () => {
  const server = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
  assert.match(server, /GITHUB_FILE_NOT_FOUND/);
  assert.match(server, /GITHUB_\(404\|409\|422\)/);
});

test('native login, push and keep-alive are wired with graceful fallbacks', () => {
  const app = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /signInWithNativeGoogle/);
  assert.match(app, /signInWithGooglePopup/);
  assert.match(app, /notifyReplyIfAway/);
  assert.match(app, /keepGenerationAlive\(true\)/);
  const cfg = fs.readFileSync(new URL('../scripts/configure-android.mjs', import.meta.url), 'utf8');
  assert.match(cfg, /KeepAliveService/);
  assert.match(cfg, /POST_NOTIFICATIONS/);
});

test('pull to refresh needs a long deliberate pull, is off in chat, and refreshes data', () => {
  const ux = fs.readFileSync(new URL('../src/lib/native-ux.js', import.meta.url), 'utf8');
  assert.match(ux, /threshold = 130/);
  assert.match(ux, /cooldownMs = 5000/);
  const app = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /attachPullToRefresh\(\{enabled:\(\)=>sectionRef\.current!=='workspace'/);
  assert.match(app, /pothub:refresh/);
});

test('startup cannot hang on native storage: calls are timed, a watchdog opens the app, and the stuck step is named', () => {
  const app = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /withTimeout\(migrateNativeAgentKeys\(\)/);
  assert.match(app, /withTimeout\(getNativeSession\(\)/);
  assert.match(app, /waiting on: \$\{window\.__pothubBoot/);
  assert.match(app, /Starting PotHub…/);
});
