import test from 'node:test';
import assert from 'node:assert/strict';
import { routeByMention, parsePromptEnvelope, stripTaskDirective } from '../src/lib/provider-mentions.js';
import { classifyRequest, classifyAgentFunction } from '../src/lib/request-intent.js';

const agents = [
  { id: 'a1', provider: 'anthropic', label: 'Claude', model: 'claude-sonnet-4-5', models: ['claude-sonnet-4-5', 'claude-haiku-4-5'] },
  { id: 'a2', provider: 'gemini', label: 'Gemini', model: 'gemini-3.6-flash' },
  { id: 'a3', provider: 'openai', label: 'GPT', model: 'gpt-4o', models: ['gpt-4o', 'gpt-4o-mini'] },
  { id: 'a4', provider: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat' },
];
const first = (text) => { const r = routeByMention(agents, text); return r.matched ? r.agents[0] : null; };

test('prompts in many shapes route to the provider or model they name', () => {
  assert.equal(first('@claude explain closures')?.provider, 'anthropic');
  assert.equal(first('use gemini to summarise this')?.provider, 'gemini');
  assert.equal(first('ask deepseek about recursion')?.provider, 'deepseek');
  assert.equal(first('claude: what is 2+2')?.provider, 'anthropic');
  assert.equal(first('utilise gemini pour traduire ce texte')?.provider, 'gemini');
  assert.equal(first('please use claaude for this')?.provider, 'anthropic');
  assert.equal(first('{"model":"deepseek","prompt":"hello"}')?.provider, 'deepseek');
  assert.equal(first('model: gpt-4o-mini\nwrite a poem')?.model, 'gpt-4o-mini');
  assert.equal(first('with gpt-4o please')?.model, 'gpt-4o');
});

test('topical mentions and unconfigured providers never reroute', () => {
  assert.equal(first('Write an essay about Claude and its history'), null);
  assert.equal(first('how do I use the gemini api in my app'), null);
  assert.equal(first('use the gemini api key from env'), null);
  assert.equal(first('run this on grok'), null);
  assert.equal(first('what is the capital of France?'), null);
  assert.equal(routeByMention([], '@claude hi').matched, false);
});

test('the named agent comes first and the rest stay as fallbacks', () => {
  const r = routeByMention(agents, 'ask deepseek to help');
  assert.equal(r.agents.length, agents.length);
  assert.equal(r.agents[0].provider, 'deepseek');
});

test('envelopes: slash commands, headers and JSON become a task plus a clean prompt', () => {
  assert.deepEqual([parsePromptEnvelope('/image a red fox').task, parsePromptEnvelope('/image a red fox').text], ['image', 'a red fox']);
  assert.equal(parsePromptEnvelope('/fix the login bug').task, 'repair');
  assert.equal(parsePromptEnvelope('task: video\na dog surfing').task, 'video');
  assert.equal(stripTaskDirective('{"model":"gemini","prompt":"hi there"}'), 'hi there');
  assert.equal(stripTaskDirective('/etc/hosts is wrong'), '/etc/hosts is wrong');
  assert.equal(stripTaskDirective('plain question'), 'plain question');
});

test('directives drive the existing task classifiers', () => {
  assert.equal(classifyRequest('/image a lighthouse at dusk').task, 'image');
  assert.equal(classifyRequest('/video waves crashing').task, 'video');
  assert.equal(classifyRequest('{"task":"image","prompt":"a cat"}').task, 'image');
  assert.equal(classifyAgentFunction('/debug why does this crash').task, 'diagnosis');
  assert.equal(classifyAgentFunction('/fix the navbar').task, 'repair');
  assert.equal(classifyRequest('how do I draw an image in canvas').task, 'chat');
});
