import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ws = fs.readFileSync(new URL('../src/ui/WorkspaceSection.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
const wl = fs.readFileSync(new URL('../server/wytelab-github.js', import.meta.url), 'utf8');

test('chat header has a History dropdown that opens a chat and closes', () => {
  assert.match(ws, /className="creator-history-button"/);
  assert.match(ws, /openChat\(c\.id\);setHistoryOpen\(false\)/);
  assert.match(css, /\.chat-history-scroll[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/);
});

test('composer provider picker lists every configured agent with its function and respects the pick', () => {
  assert.match(ws, /agent-picker-fn">\{a\.function\}/);
  assert.match(ws, /setPickedAgent\(a\.function,a\.id\)/);
  assert.match(app, /const pins=await getPickedAgents\(\)/);
  assert.match(app, /if\(pinned\)return \[pinned\]/);
});

test('repo file opening shows the real reason and survives a stale branch', () => {
  assert.match(app, /PotHub could not complete that action \(HTTP \$\{status\}\)/);
  assert.match(wl, /default_branch\|\|"main"/);
  assert.match(wl, /undefined\|null\|HEAD/);
});


test('technical chat shows only a faded blinking status line while working, never a step list', () => {
  assert.match(app, /executionSteps=showExecutionPlan\?/);
  assert.match(app, /updateExecutionStep\(4,'active'\)/);
  assert.match(ws, /<StatusLine label=\{activeLabel\(m\.executionSteps\)\}\/>/);
  assert.doesNotMatch(ws, /className="execution-timeline"/);
  assert.match(fs.readFileSync(new URL('../src/ui/pothub-ui.css', import.meta.url), 'utf8'), /\.status-line-text\{[^}]*animation:statusBlink/);
});

test('agents can request any repository file and PotHub fetches it', () => {
  assert.match(app, /extractReadRequests\(replyText/);
  assert.match(app, /readPaths:readReq/);
  assert.match(app, /slice\(0,Math\.max\(1,24-attachmentPayload\.length\)\)/);
});
