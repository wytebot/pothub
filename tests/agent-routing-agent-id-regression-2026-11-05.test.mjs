import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackSequence } from '../src/lib/agent-routing.js';

test('fallback sequence preserves agent IDs for server-side agent lookup', () => {
  const result = buildFallbackSequence([{
    key: 'test-key',
    models: ['test-model'],
    provider: 'gemini',
    task: 'chat',
    agentId: 'saved-chat-agent-123',
  }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].agentId, 'saved-chat-agent-123');
});
