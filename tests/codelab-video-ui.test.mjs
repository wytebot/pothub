import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const codelab = readFileSync(new URL('../src/ui/CodelabWorkspace.jsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/ui/WorkspaceSection.jsx', import.meta.url), 'utf8');
test('Codelab does not show the empty repository-editor splash before a repo is selected', () => {
  assert.match(codelab, /\{activeRepo&&<div className="codelab-editor panel">/);
  assert.doesNotMatch(codelab, /Choose a repository to inspect files, edit code/);
});
test('selected repository editor exposes Chat AI action wired to the selected repository', () => {
  assert.match(codelab, /onClick=\{\(\)=>onOpenAI\?\.\(activeRepo\)\}/);
  assert.match(codelab, /Chat AI/);
});
test('AI response details are collapsed under a dropdown by default', () => {
  assert.match(workspace, /<details className="ai-response-options">/);
  assert.match(workspace, /<summary>Response options<\/summary>/);
  assert.match(workspace, /Inspected: \{m\.filesInspected\.join/);
});
