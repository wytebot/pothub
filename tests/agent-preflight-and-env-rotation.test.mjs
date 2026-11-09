import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringProtocol, withEngineeringProtocol } from '../server/engineering-protocol.js';
import fs from 'node:fs';

 test('engineering prompts require repository inspection, plan-before-write and evidence-based delivery', () => {
  for (const mode of ['diagnose','patch','edit','readonly','chat']) {
    const prompt = engineeringProtocol(mode);
    assert.match(prompt, /REPOSITORY PREFLIGHT/);
    assert.match(prompt, /Explain the diagnosis and implementation plan before changing anything/);
    assert.match(prompt, /Delivery report/);
    assert.match(prompt, /Prompt-to-result reconciliation/);
  }
  const prompt = withEngineeringProtocol('Inspect and fix this repository', 'patch');
  assert.match(prompt, /REPOSITORY PREFLIGHT/);
  assert.match(prompt, /CHANGE-SAFETY PROTOCOL/);
  assert.match(prompt, /REPOSITORY PREFLIGHT/);
  assert.equal(withEngineeringProtocol(prompt, 'patch'), prompt);
  assert.match(withEngineeringProtocol('HONESTY RULES (apply to everything you write)', 'patch'), /REPOSITORY PREFLIGHT/);
 });

test('Vercel variables UI supports write-only secret rotation by re-entering a value', () => {
  const ui = fs.readFileSync(new URL('../src/ui/vercel/VariablesTab.jsx', import.meta.url), 'utf8');
  const hook = fs.readFileSync(new URL('../src/ui/vercel/useEnvDraft.js', import.meta.url), 'utf8');
  assert.match(ui, /Edit \/ rotate/);
  assert.match(ui, /draft\.replace\(variable\.key, true\)/);
  assert.match(ui, /Vercel never returns variable values/);
  assert.match(hook, /const replace = React\.useCallback/);
});

test('Manage Variables exposes function/model assignment and saves the fixed runtime map', () => {
  const ui = fs.readFileSync(new URL('../src/ui/vercel/VariablesTab.jsx', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
  assert.match(ui, /Save AI function assignments/);
  assert.match(ui, /POTHUB_AI_AGENT_MAP/);
  assert.match(ui, /Exact model ID/);
  assert.match(server, /app\.get\('\/api\/agent\/runtime-env'/);
  assert.match(server, /aiAgentMap:String\(row\.aiAgentMapProjectId/);
  assert.match(server, /POTHUB_RUNTIME_PROJECT_ID/);
  assert.match(server, /selectedProjectId\|\|''\)!==runtimeProject/);
});

test('backend mode header gates runtime environment candidates and is retained by streamed chat', () => {
  const server = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
  const ui = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
  assert.match(server, /x-pothub-provider-mode/);
  assert.match(server, /req.pothubRuntimeCandidates/);
  assert.match(server, /headers:req\.headers/);
  assert.match(ui, /X-Pothub-Provider-Mode':'backend'/);
  assert.match(server, /resolveVideoRequestKey/);
  assert.match(server, /runtimeAgentCandidatesForUser\(userId,'video'\)/);
  assert.match(ui, /runtimeEnv\?''/);
  assert.match(ui, /X-Pothub-Provider-Mode':'backend'/);
});
