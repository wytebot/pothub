import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');

test('Creator chat sends the selected locally configured BYOK agent config and stable IDs', () => {
  assert.match(app, /const stripAgentMeta=.*agentId/);
  assert.match(app, /agentIds:headers\.agentIds,agentConfig:headers\.agentConfig/);
});

test('Creator chat can continue with local configured agents when cloud sync is unavailable', () => {
  assert.match(app, /await syncAgentWorkspaceNow\(\)\.catch\(e=>console\.warn\(.*?\)\);ags=await functionAgents\('Chat'\)/);
});

test('stream endpoint validates transient agent config and restricts it to selected agent IDs', () => {
  assert.match(server, /agentConfig:z\.object\(\{keys:z\.array/);
  assert.match(server, /const transientCandidates=requestAgentConfig\(\{path:req\.path,body:\{agentConfig:i\.agentConfig\}\}\)/);
});

test('server keeps BYOK candidates account-scoped and never adds platform credentials', () => {
  assert.match(server, /source:'user'/);
  assert.match(server, /requestServerAgentConfig\(s\.user\.id,i\.agentIds,'chat'\)/);
  assert.match(server, /requestServerAgentConfig\(s\.user\.id,i\.agentIds\|\|\[\],'chat'\)/);
  assert.match(server, /c\.source==='user'/);
});
