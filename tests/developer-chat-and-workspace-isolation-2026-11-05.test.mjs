import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
const workspace = fs.readFileSync(new URL('../src/ui/WorkspaceSection.jsx', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
test('creator chat history excludes repository-scoped developer conversations', () => {
  assert.match(app, /startsWith\('repo:'\)/);
  assert.match(app, /if\(isDeveloper\)\{setChatId\(null\);setMessages\(\[\]\)\}/);
  assert.match(app, /async function openChat\(id\)\{if\(String\(id\|\|'\'\)\.startsWith\('repo:'\)\)return/);
  assert.match(workspace, /items\.filter\(c=>!String\(c\.id\|\|'\'\)\.startsWith\('repo:'\)/);
});
test('developer chat no longer returns a canned keyword-based refusal', () => {
  assert.doesNotMatch(server, /const developerIntent=/);
  assert.doesNotMatch(server, /I’m only built to assist with this repository/);
  assert.match(server, /Never default to a tiny or short code snippet/);
});
test('creator chat transcript is the only scroll container and controls are compact', () => {
  assert.match(styles, /\.creator-chat-mode \.chat-main\{[^}]*overflow:hidden/);
  assert.match(styles, /\.creator-chat-mode \.chat-scroll\{[^}]*overflow-y:auto/);
  assert.match(workspace, /creator-library-icon/);
});
