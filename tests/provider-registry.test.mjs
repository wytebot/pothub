import test from 'node:test';
import assert from 'node:assert/strict';
import {PROVIDERS,providersForFunction,normalizeProvider,providerById,modelsForFunction,DEFAULT_MODELS} from '../src/lib/provider-registry.js';

test('registry includes the requested text providers and both custom protocols',()=>{
  for(const id of ['openai','anthropic','gemini','mistral','groq','deepseek','xai','cohere','perplexity','together','fireworks','openrouter','azure-openai','huggingface','openai-compatible','anthropic-compatible'])assert.ok(providerById(id),`missing ${id}`);
});
test('function filters do not leak image/video-only models into chat',()=>{
  const chat=providersForFunction('Chat');
  assert.ok(chat.length>=10);
  assert.ok(chat.every(p=>p.capabilities.includes('text')));
  assert.ok(!chat.some(p=>p.id==='stability'||p.id==='runway'||p.id==='luma'));
  assert.ok(providersForFunction('Image').some(p=>p.id==='gemini'));assert.deepEqual(modelsForFunction('gemini','Image'),['gemini-nano-banana-2.1','gemini-3.1-flash-image','gemini-3-pro-image']);assert.deepEqual(modelsForFunction('openai','Image'),['gpt-image-2','gpt-image-2.5-sunburst','gpt-image-2.5-flare']);
  for(const id of ['openai','stability','replicate','fal','black-forest-labs'])assert.ok(providersForFunction('Image').some(p=>p.id===id),`image adapter missing ${id}`);
  assert.deepEqual(providersForFunction('Video').map(p=>p.id),['gemini','replicate','runway','luma','kling']);
  for(const id of ['runway','luma','kling','replicate'])assert.equal(providerById(id).implemented,true);
  assert.ok(!providersForFunction('Chat').some(p=>p.id==='stability'));
  assert.ok(modelsForFunction('replicate','Video').every(m=>/video|kling/i.test(m)));
  assert.ok(modelsForFunction('replicate','Image').every(m=>/flux/i.test(m)));
});
test('legacy provider labels normalize without breaking saved agents',()=>{
  assert.equal(normalizeProvider('Gemini'),'gemini');
  assert.equal(normalizeProvider('OpenAI-compatible'),'openai-compatible');
  assert.equal(normalizeProvider('Anthropic-compatible'),'anthropic-compatible');
  assert.equal(normalizeProvider('unknown-provider'),null);
  assert.equal(DEFAULT_MODELS.text,'gemini-3.8-flash');
  assert.equal(providerById('azure-openai').implemented,false);
});
test('provider declarations remain unique and carry capabilities',()=>{
  const ids=PROVIDERS.map(p=>p.id);assert.equal(new Set(ids).size,ids.length);
  assert.ok(PROVIDERS.every(p=>p.label&&p.protocol&&Array.isArray(p.capabilities)));
});
