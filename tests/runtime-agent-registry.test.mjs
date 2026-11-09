import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverRuntimeAgentCandidates, runtimeAgentAvailability } from '../server/runtime-agent-registry.js';

test('runtime registry discovers common provider keys without exposing them in metadata', () => {
  const env = { GEMINI_API_KEY: 'gem-secret-value', OPENAI_API_KEY: 'openai-secret-value', ANTHROPIC_API_KEY: 'anthropic-secret-value' };
  const chat = discoverRuntimeAgentCandidates('chat', env);
  assert.ok(chat.some(x => x.provider === 'gemini' && x.key === 'gem-secret-value'));
  assert.ok(chat.some(x => x.provider === 'openai'));
  assert.ok(chat.some(x => x.provider === 'anthropic'));
  const metadata = runtimeAgentAvailability(env);
  assert.ok(metadata.find(x => x.task === 'chat').providers.includes('gemini'));
  assert.equal(JSON.stringify(metadata).includes('secret-value'), false);
});

test('explicit POTHUB_AI_AGENT_MAP routes only the assigned function and exact model', () => {
  const env = {
    GEMINI_API_KEY: 'gem-secret-value',
    POTHUB_AI_AGENT_MAP: JSON.stringify([
      { function: 'Diagnosis', provider: 'gemini', keyEnv: 'GEMINI_API_KEY', model: 'gemini-3.6-flash' },
      { function: 'Image', provider: 'gemini', keyEnv: 'GEMINI_API_KEY', model: 'gemini-3.1-flash-image' }
    ])
  };
  const diagnosis = discoverRuntimeAgentCandidates('diagnosis', env);
  assert.equal(diagnosis.length, 1);
  assert.equal(diagnosis[0].model, 'gemini-3.6-flash');
  assert.equal(discoverRuntimeAgentCandidates('chat', env).length, 0);
  const image = discoverRuntimeAgentCandidates('image', env);
  assert.equal(image.length, 1);
  assert.equal(image[0].model, 'gemini-3.1-flash-image');
});

test('runtime registry rejects unknown providers, invalid env names, empty secrets and unsupported media models', () => {
  const unknown = { POTHUB_AI_AGENT_MAP: JSON.stringify([{ function: 'Chat', provider: 'made-up', keyEnv: 'CUSTOM_KEY', model: 'm1' }]), CUSTOM_KEY: 'secret' };
  assert.deepEqual(discoverRuntimeAgentCandidates('chat', unknown), []);
  const invalid = { POTHUB_AI_AGENT_MAP: JSON.stringify([{ function: 'Chat', provider: 'gemini', keyEnv: 'BAD-NAME', model: 'm1' }]), 'BAD-NAME': 'secret' };
  assert.deepEqual(discoverRuntimeAgentCandidates('chat', invalid), []);
  assert.deepEqual(discoverRuntimeAgentCandidates('chat', { GEMINI_API_KEY: '  ' }), []);
  const unsafePointer = { POTHUB_AI_AGENT_MAP: JSON.stringify([{ function: 'Chat', provider: 'gemini', keyEnv: 'DATABASE_URL', model: 'gemini-3.6-flash' }]), DATABASE_URL: 'database-secret' };
  assert.deepEqual(discoverRuntimeAgentCandidates('chat', unsafePointer), []);
  assert.deepEqual(discoverRuntimeAgentCandidates('video', { GEMINI_API_KEY: 'secret' }), []);
});

test('legacy fixed environment pointers read the exact key and model variable names', () => {
  const env = { GEMINI_API_KEY: 'gem-secret-value', GEMINI_MODEL: 'gemini-3.6-flash', POTHUB_AI_KEY_ENV: 'GEMINI_API_KEY', POTHUB_AI_MODEL_ENV: 'GEMINI_MODEL' };
  const rows = discoverRuntimeAgentCandidates('chat', env);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].keyEnv, 'GEMINI_API_KEY');
  assert.equal(rows[0].modelEnv, 'GEMINI_MODEL');
  assert.equal(rows[0].model, 'gemini-3.6-flash');
});

test('runtime fallback model pointer is read by exact environment-variable name', () => {
  const env = {
    GEMINI_API_KEY: 'gem-secret-value',
    GEMINI_MODEL: 'gemini-3.6-flash',
    GEMINI_FALLBACK_MODELS: 'gemini-3.5-flash-lite,gemini-3.6-flash',
    POTHUB_AI_KEY_ENV: 'GEMINI_API_KEY',
    POTHUB_AI_MODEL_ENV: 'GEMINI_MODEL',
    POTHUB_AI_FALLBACK_ENV: 'GEMINI_FALLBACK_MODELS'
  };
  const rows = discoverRuntimeAgentCandidates('chat', env);
  assert.deepEqual(rows[0].models, ['gemini-3.6-flash', 'gemini-3.5-flash-lite']);
  assert.equal(rows.every(x => x.fallbackEnv === 'GEMINI_FALLBACK_MODELS'), true);
});

test('custom OpenAI-compatible runtime agents require a public endpoint and exact model assignment', () => {
  const valid = {
    CUSTOM_AI_API_KEY: 'custom-secret-value',
    POTHUB_AI_AGENT_MAP: JSON.stringify([{ function: 'Chat', provider: 'openai-compatible', keyEnv: 'CUSTOM_AI_API_KEY', model: 'vendor-chat-2026', baseUrl: 'https://api.example.ai/v1' }])
  };
  const rows = discoverRuntimeAgentCandidates('chat', valid);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].baseUrl, 'https://api.example.ai/v1');
  const missingEndpoint = { ...valid, POTHUB_AI_AGENT_MAP: JSON.stringify([{ function: 'Chat', provider: 'openai-compatible', keyEnv: 'CUSTOM_AI_API_KEY', model: 'vendor-chat-2026' }]) };
  assert.deepEqual(discoverRuntimeAgentCandidates('chat', missingEndpoint), []);
});


test('an explicit empty or malformed function map fails closed instead of auto-routing every provider key', () => {
  assert.deepEqual(discoverRuntimeAgentCandidates('chat', { GEMINI_API_KEY: 'gem-secret-value', POTHUB_AI_AGENT_MAP: '[]' }), []);
  assert.deepEqual(discoverRuntimeAgentCandidates('chat', { GEMINI_API_KEY: 'gem-secret-value', POTHUB_AI_AGENT_MAP: '{broken' }), []);
});
