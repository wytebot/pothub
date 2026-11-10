import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
const policy = fs.readFileSync(new URL('../server/agent-mode-policy.js', import.meta.url), 'utf8');

test('all UI AI actions source candidates from API & Agents Dexie records', () => {
  assert.match(ui, /async function functionAgents\(fn(?:,hint='')?\).*db\.agents\.where\('function'\)/);
  assert.match(ui, /async function sendMessage\(overrideText\).*functionAgents\(agentFunction(?:,rawCurrentText)?\)/);
  assert.match(ui, /async function generateImage\([^)]*\).*functionAgents\('Image'(?:,imagePrompt)?\)/);
  assert.match(ui, /async function generateVideo\(.*functionAgents\('Video'(?:,videoPrompt)?\)/);
  assert.match(ui, /async function developerChat\(payload\).*functionAgents\('Chat'\)/);
  assert.doesNotMatch(ui, /developerAgentMode|savingAgentMode|\/api\/settings\/agent-mode/);
});

test('legacy separate AI mode endpoint is removed and server requires request BYOK candidates', () => {
  assert.doesNotMatch(server, /\/api\/settings\/agent-mode/);
  assert.match(server, /chooseOperationAgents\(\{workspace,candidates:configured\}\)/);
  assert.match(policy, /No BYOK agent is configured for this task/);
  assert.doesNotMatch(server, /process\.env\.(?:GEMINI|OPENAI|ANTHROPIC)_API_KEY/);
});

test('Settings presents API & Agents as the sole source of model configuration', () => {
  assert.match(ui, /AI configuration source/);
  assert.match(ui, /API &amp; Agents is the only source of AI providers/);
  assert.doesNotMatch(ui, /Developer AI mode|Add my agent|Own agent mode is selected/);
});
