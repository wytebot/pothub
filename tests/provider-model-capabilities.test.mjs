import test from 'node:test';
import assert from 'node:assert/strict';
import { filterDiscoveredModels } from '../src/lib/provider-registry.js';

test('Gemini model discovery filters by agent function and advertised generation methods', () => {
  const rows = [
    { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-3.1-flash-image', displayName: 'Gemini Image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/veo-3.1-generate-preview', displayName: 'Veo video generation' },
    { name: 'models/gemini-tts', displayName: 'Gemini TTS', supportedGenerationMethods: ['generateContent'] },
  ];
  assert.deepEqual(filterDiscoveredModels('gemini', 'Diagnosis', rows), ['gemini-3.8-flash']);
  assert.deepEqual(filterDiscoveredModels('gemini', 'Image', rows), ['gemini-3.1-flash-image']);
  assert.deepEqual(filterDiscoveredModels('gemini', 'Video', rows), ['veo-3.1-generate-preview']);
});

test('OpenAI-compatible discovery hides non-text models for chat and exposes image candidates only for Image', () => {
  const rows = [
    { id: 'gpt-4.1-mini' },
    { id: 'text-embedding-3-large' },
    { id: 'gpt-image-2' },
    { id: 'sora-2' },
  ];
  assert.deepEqual(filterDiscoveredModels('openai', 'Chat', rows), ['gpt-4.1-mini']);
  assert.deepEqual(filterDiscoveredModels('openai', 'Image', rows), ['gpt-image-2']);
  assert.deepEqual(filterDiscoveredModels('openai', 'Video', rows), ['sora-2']);
});
