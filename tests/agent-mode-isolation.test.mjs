import test from 'node:test';
import assert from 'node:assert/strict';
import { agentAllowedInMode, transientAgentAllowedInMode } from '../server/agent-mode-policy.js';

test('saved Vercel Backend agents cannot be selected in direct mode and direct agents cannot be selected in backend mode', () => {
  const backend = { label: 'Vercel Backend', provider: 'openai-compatible' };
  const direct = { label: 'My Gemini', provider: 'gemini' };
  assert.equal(agentAllowedInMode(backend, 'backend'), true);
  assert.equal(agentAllowedInMode(backend, 'direct'), false);
  assert.equal(agentAllowedInMode(direct, 'backend'), false);
  assert.equal(agentAllowedInMode(direct, 'direct'), true);
});

test('transient candidates cannot smuggle direct credentials into backend mode or proxy credentials into direct mode', () => {
  const proxy = { provider: 'openai-compatible', key: 'pothub-proxy-env-key', keyEnv: 'OPENAI_API_KEY' };
  const direct = { provider: 'openai', key: 'real-direct-key' };
  assert.equal(transientAgentAllowedInMode(proxy, 'backend'), true);
  assert.equal(transientAgentAllowedInMode(direct, 'backend'), false);
  assert.equal(transientAgentAllowedInMode(proxy, 'direct'), false);
  assert.equal(transientAgentAllowedInMode(direct, 'direct'), true);
});
