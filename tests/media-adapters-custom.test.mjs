import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImage } from '../server/image-adapters.js';
import { verifyVideoProvider } from '../server/video-adapters.js';
import { providersForFunction } from '../src/lib/provider-registry.js';

const KEY = 'k'.repeat(32);

test('custom OpenAI-compatible and Azure endpoints are selectable Image providers', () => {
  const ids = providersForFunction('Image').map(p => p.id);
  for (const id of ['openai-compatible', 'azure-openai']) assert.ok(ids.includes(id), id);
  assert.ok(!providersForFunction('Video').some(p => /compatible|azure/.test(p.id)));
});

test('custom image adapter is routed (not "not implemented") and needs an endpoint', async () => {
  for (const provider of ['openai-compatible', 'azure-openai']) {
    await assert.rejects(() => generateImage({ provider, key: KEY, model: 'any-model' }, { prompt: 'a cat', count: 1 }), /Enter the API endpoint/);
  }
});

test('custom image endpoints cannot reach private or non-HTTPS addresses', async () => {
  for (const baseUrl of ['https://127.0.0.1/v1', 'https://10.0.0.5/v1', 'http://example.com/v1']) {
    await assert.rejects(() => generateImage({ provider: 'openai-compatible', key: KEY, model: 'm', baseUrl }, { prompt: 'a cat', count: 1 }));
  }
});

test('video key checks never start a paid generation and fail closed', async () => {
  assert.match(await verifyVideoProvider({ provider: 'kling', key: KEY, model: 'kling-3.0' }), /first generation/);
  await assert.rejects(() => verifyVideoProvider({ provider: 'nope', key: KEY, model: 'm' }), /Unsupported video provider/);
  await assert.rejects(() => verifyVideoProvider({ provider: 'replicate', key: KEY, model: 'not a model' }), /owner\/name/);
  await assert.rejects(() => verifyVideoProvider({ provider: 'runway', key: 'short', model: 'gen4.5' }), /valid provider API key/);
});
