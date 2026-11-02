import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const codelab = readFileSync(new URL('../src/ui/CodelabWorkspace.jsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/ui/WorkspaceSection.jsx', import.meta.url), 'utf8');
test('AI response details are collapsed under a dropdown by default', () => {
  assert.match(workspace, /<details className="ai-response-options">/);
  assert.match(workspace, /<summary>Response options<\/summary>/);
  assert.match(workspace, /Inspected: \{m\.filesInspected\.join/);
});
