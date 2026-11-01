import test from 'node:test';
import assert from 'node:assert/strict';
import { interleaveAgentCandidates } from '../src/lib/agent-routing.js';

test('BYOK fallback tries primary model for each configured key before model variants', () => {
  const rows = interleaveAgentCandidates([
    { key: 'key-one', provider: 'gemini', task: 'chat', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'] },
    { key: 'key-two', provider: 'openai', task: 'chat', models: ['gpt-4.1-mini', 'gpt-4.1'] },
  ], 8);
  assert.deepEqual(rows.map(x => `${x.key}:${x.model}`), [
    'key-one:gemini-2.5-flash', 'key-two:gpt-4.1-mini',
    'key-one:gemini-2.5-pro', 'key-two:gpt-4.1',
    'key-one:gemini-2.0-flash',
  ]);
});

test('BYOK fallback preserves each model with its own key, provider, endpoint and task', () => {
  const rows = interleaveAgentCandidates([
    { key: 'secret-a', provider: 'gemini', baseUrl: '', task: 'diagnosis', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
    { key: 'secret-b', provider: 'openai-compatible', baseUrl: 'https://api.example.com/v1', task: 'diagnosis', models: ['model-a'] },
  ], 8);
  assert.equal(rows[1].key, 'secret-b');
  assert.equal(rows[1].baseUrl, 'https://api.example.com/v1');
  assert.equal(rows[1].provider, 'openai-compatible');
  assert.equal(rows[1].task, 'diagnosis');
});

test('BYOK fallback is bounded and removes duplicate model/key candidates', () => {
  const rows = interleaveAgentCandidates([
    { key: 'same-key', provider: 'gemini', task: 'chat', models: ['m1', 'm1', 'm2', 'm3'] },
    { key: 'same-key', provider: 'gemini', task: 'chat', models: ['m1', 'm2'] },
  ], 3);
  assert.deepEqual(rows.map(x => x.model), ['m1', 'm2', 'm3']);
  assert.equal(rows.length, 3);
});

test('agents without a configured key/provider/model are never candidates', () => {
  assert.deepEqual(interleaveAgentCandidates([
    { key: '', provider: 'gemini', models: ['m1'] },
    { key: 'secret', provider: '', models: ['m1'] },
    { key: 'secret', provider: 'gemini', models: [] },
  ]), []);
});

test('API agent test UI tests configured model variants rather than only the primary model', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes('const models=[...new Set([a.model,...(Array.isArray(a.models)?a.models:[])]'));
  assert.match(app, /passed=results\.some\(result=>result\.ok\)/);
  assert.match(app, /A configured fallback model was used/);
});
