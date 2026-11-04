import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../server/app.js', import.meta.url), 'utf8');
const registry = await readFile(new URL('../src/lib/provider-registry.js', import.meta.url), 'utf8');

test('Gemini inference does not gate a configured model on models.list membership', () => {
  assert.match(app, /Discovery is advisory only[\s\S]{0,350}never block a user-configured model/);
  assert.doesNotMatch(app, /liveModels&&!liveModels\.includes\(c\.model\).*deferred/);
});

test('Gemini image requests use provider response instead of model-name substring allowlist', () => {
  assert.match(app, /Do not infer output capability from a model ID/);
  assert.match(app, /responseModalities:\['TEXT','IMAGE'\]/);
  assert.doesNotMatch(app, /if\(!\/(?:\?:image\|nano\.?banana)\/i\.test\(String\(c\.model\|\|'\'\)\)\)/);
  assert.match(registry, /Do not reject discovered IDs using name fragments/);
});

test('Gemini image agent test probes actual image output rather than model-name heuristics', () => {
  assert.match(app, /Probe the actual generateContent IMAGE response modality/);
  assert.match(app, /const hasImage=\(data\.candidates\|\|\[\]\)\.some/);
  assert.doesNotMatch(app, /candidate\.task==='image'\?\/\(image\|imagen\)\//);
});

test('OpenAI image generation does not reject a BYOK model by hardcoded ID list', () => {
  assert.doesNotMatch(app, /modelsForFunction\('openai','Image'\)\.includes\(c\.model\)/);
  assert.doesNotMatch(app, /Selected OpenAI model does not support image generation/);
});
