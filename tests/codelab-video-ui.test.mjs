import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const codelab = readFileSync(new URL('../src/ui/CodelabWorkspace.jsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/ui/WorkspaceSection.jsx', import.meta.url), 'utf8');
test('the separate Edit chat is gone; repository chats use the normal chat composer', () => {
  assert.doesNotMatch(workspace, /className="panel edit-workspace"/);
  assert.doesNotMatch(workspace, /<details className="ai-response-options">/);
  assert.match(workspace, /Chat about this repo/);
  assert.match(workspace, /openRepoAI\(repo\)/);
});
