import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildFallbackSequence } from '../src/lib/agent-routing.js';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('fallback sequence keeps task agents first and appends sibling saved agents without duplicates', () => {
  const primary = [{ key: 'k1', provider: 'gemini', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] }, { key: 'k2', provider: 'openai', models: ['gpt-4.1-mini'] }];
  const extra = [{ key: 'k3', provider: 'anthropic', models: ['claude-sonnet-4-5'] }, { key: 'k1', provider: 'gemini', models: ['gemini-2.5-flash'] }];
  const out = buildFallbackSequence(primary, extra, 8);
  assert.deepEqual(out.map(x => `${x.key}:${x.model}`), ['k1:gemini-2.5-flash', 'k2:gpt-4.1-mini', 'k1:gemini-2.5-pro', 'k3:claude-sonnet-4-5']);
});

test('fallback sequence never exceeds the limit and never invents candidates', () => {
  const primary = [{ key: 'k1', provider: 'gemini', models: ['a', 'b', 'c'] }];
  assert.equal(buildFallbackSequence(primary, [{ key: 'k9', provider: 'openai', models: ['x'] }], 3).length, 3);
  assert.deepEqual(buildFallbackSequence([], [], 8), []);
  assert.deepEqual(buildFallbackSequence([{ key: '', provider: 'gemini', models: ['a'] }], [], 8), []);
});

test('server model router only accepts saved-agent candidates and has multi-pass fallback', async () => {
  const app = await read('server/app.js');
  const start = app.indexOf('async function modelJson(');
  const body = app.slice(start, app.indexOf('const AI_OUTPUT_SCHEMAS'));
  assert.match(body, /filter\(x=>x\.source==='user' && x\.model/);
  assert.doesNotMatch(body, /process\.env\.[A-Z_]*(API_KEY|GEMINI_KEY|OPENAI|ANTHROPIC)/);
  assert.match(body, /Pass 2/);
  assert.match(body, /Pass 3/);
  assert.match(body, /deadPairs/);
  assert.match(body, /Your configured agent did not complete this request/);
  assert.match(body, /AGENT_ROUTES_FAILED/);
});

test('catalog or circuit-breaker skips are deferred, not dropped, and Gemini catalog is fully paged', async () => {
  const app = await read('server/app.js');
  assert.match(app, /deferred:true/);
  assert.match(app, /v1beta\/models\?pageSize=1000/);
});

test('Gemini models that cannot disable thinking are retried on the same configured model', async () => {
  const app = await read('server/app.js');
  assert.match(app, /classifyProviderFailure\(e\)\.kind==='thinking'/);
  assert.match(app, /run\(false\)/);
});

test('client sends only agents saved on API & Agents, compatible with the task, in strict priority order', async () => {
  const ui = await read('src/ui/App.jsx');
  assert.match(ui, /prepareAgentCandidates/);
  assert.match(ui, /buildFallbackSequence\(primary,extra,8\)/);
  assert.match(ui, /providersForFunction\(fn\)\.some/);
  assert.doesNotMatch(ui, /GEMINI_API_KEY|process\.env\.NEXT_PUBLIC_[A-Z_]*API_KEY/);
});
