import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDeprecations, createModelCatalog, parseDates } from '../server/model-catalog.js';

const NOW = Date.UTC(2026, 10, 1);

test('table with replacement column flags the old model and never the replacement', () => {
  const html = `<table><tr><th>Model</th><th>Shutdown date</th><th>Recommended replacement</th></tr>
  <tr><td>gemini-2.0-flash</td><td>February 2026</td><td>gemini-2.5-flash</td></tr>
  <tr><td>gemini-1.5-pro</td><td>2025-09-24</td><td>gemini-2.5-pro</td></tr></table>`;
  const found = extractDeprecations(html, { now: NOW });
  assert.equal(found.get('gemini-2.0-flash')?.status, 'retired');
  assert.equal(found.get('gemini-1.5-pro')?.status, 'retired');
  assert.ok(!found.has('gemini-2.5-flash'));
  assert.ok(!found.has('gemini-2.5-pro'));
});

test('explicit status rows without a header still skip the replacement cell', () => {
  const found = extractDeprecations('gpt-4.5-preview | Deprecated | 2025-07-14 | gpt-4.1', { now: NOW });
  assert.ok(found.has('gpt-4.5-preview'));
  assert.ok(!found.has('gpt-4.1'));
});

test('prose picks the deprecated model, not the one recommended instead', () => {
  const found = extractDeprecations('Please use gpt-4.1 instead of gpt-4-0613, which is deprecated.', { now: NOW });
  assert.ok(found.has('gpt-4-0613'));
  assert.ok(!found.has('gpt-4.1'));
});

test('active or far-future lifecycle rows stay visible', () => {
  const html = `<table><tr><th>Model</th><th>Status</th><th>Retirement date</th></tr>
  <tr><td>gemini-2.5-flash</td><td>Generally available</td><td>2027-06-17</td></tr></table>
  claude-sonnet-4-5 is active and generally available.`;
  const found = extractDeprecations(html, { now: NOW });
  assert.equal(found.size, 0);
});

test('a scheduled retirement inside the horizon is hidden as deprecated', () => {
  const html = `<table><tr><th>Model</th><th>Deprecation date</th></tr><tr><td>mistral-small-2402</td><td>2026-12-15</td></tr></table>`;
  assert.equal(extractDeprecations(html, { now: NOW }).get('mistral-small-2402')?.status, 'deprecated');
});

test('date parsing handles ISO, month-name and month-only formats', () => {
  assert.deepEqual(parseDates('2026-03-05'), [Date.UTC(2026, 2, 5)]);
  assert.deepEqual(parseDates('March 5, 2026'), [Date.UTC(2026, 2, 5)]);
  assert.deepEqual(parseDates('5 March 2026'), [Date.UTC(2026, 2, 5)]);
  assert.deepEqual(parseDates('Marketing 2026'), []);
});

// The catalog now asks `discover(provider, cfg, modelIds)` for lifecycle evidence. Tests inject it and feed the
// documentation text through the real extractDeprecations parser, so no network or Gemini key is needed.
const DOC_URL = 'https://platform.openai.com/docs/deprecations';
function discoverFrom({ pages, results, search, calls }) {
  return async (provider, cfg, modelIds) => {
    const hits = search ? await search() : (calls.search += 1, results || [{ url: DOC_URL, snippet: '' }]);
    const official = hits.filter((h) => new URL(h.url).hostname === 'platform.openai.com');
    if (!official.length) throw new Error('No official documentation source was returned.');
    const deprecated = [];
    for (const hit of official) {
      calls.fetch += 1;
      const found = extractDeprecations(pages[hit.url] ?? '', { now: NOW });
      for (const [id, info] of found) {
        const real = modelIds.find((m) => m.toLowerCase() === id);
        if (real && new URL(hit.url).hostname === 'platform.openai.com') deprecated.push({ id: real, status: info.status, date: info.date, source: hit.url });
      }
    }
    return { deprecated, sources: [...new Set(deprecated.map((x) => x.source))] };
  };
}
function catalog({ env = {}, pages = {}, results, store, search } = {}) {
  const calls = { search: 0, fetch: 0 };
  const records = new Map();
  const c = createModelCatalog({
    env: { GEMINI_API_KEY: 'k', ...env },
    now: () => NOW,
    store: store === undefined ? { get: async (id) => records.get(id) || null, set: async (id, v) => { records.set(id, v); } } : store,
    discover: discoverFrom({ pages, results, search: search && (async () => { calls.search += 1; return search(); }), calls }),
  });
  return { c, calls, records };
}

const OPENAI_PAGE = '<table><tr><th>Model</th><th>Shutdown date</th><th>Replacement</th></tr><tr><td>gpt-4-0613</td><td>2025-06-06</td><td>gpt-4.1</td></tr></table>';

test('filterActiveModels hides retired models, reports them, and caches the lookup', async () => {
  const { c, calls } = catalog({ pages: { 'https://platform.openai.com/docs/deprecations': OPENAI_PAGE } });
  const r1 = await c.filterActiveModels('openai', ['gpt-4.1', 'gpt-4-0613', 'gpt-4o']);
  assert.deepEqual(r1.active, ['gpt-4.1', 'gpt-4o']);
  assert.deepEqual(r1.hidden.map((x) => x.id), ['gpt-4-0613']);
  assert.equal(r1.verified, true);
  await c.filterActiveModels('openai', ['gpt-4.1']);
  assert.equal(calls.search, 1, 'second call is served from cache');
});

test('results from non-official hosts are ignored', async () => {
  const { c } = catalog({ results: [{ url: 'https://evil.example.com/openai-deprecations', snippet: 'gpt-4o is deprecated and retired 2025-01-01' }] });
  const r = await c.filterActiveModels('openai', ['gpt-4o', 'gpt-4.1']);
  assert.deepEqual(r.active, ['gpt-4o', 'gpt-4.1']);
  assert.equal(r.verified, false);
});

test('fails open without a search key, on search errors, and when everything would be hidden', async () => {
  const noKey = catalog({ env: { GEMINI_API_KEY: '' } });
  assert.deepEqual((await noKey.c.filterActiveModels('openai', ['a-1', 'b-2'])).active, ['a-1', 'b-2']);

  const broken = catalog({ search: async () => { throw new Error('boom'); } });
  const r = await broken.c.filterActiveModels('openai', ['a-1', 'b-2']);
  assert.deepEqual(r.active, ['a-1', 'b-2']);
  assert.equal(r.verified, false);

  const all = catalog({ pages: { 'https://platform.openai.com/docs/deprecations': 'gpt-4-0613 | Deprecated | 2025-06-06\nand gpt-4-32k | Deprecated | 2025-06-06' } });
  const h = await all.c.filterActiveModels('openai', ['gpt-4-0613', 'gpt-4-32k']);
  assert.deepEqual(h.active, ['gpt-4-0613', 'gpt-4-32k']);
  assert.equal(h.reason, 'would-hide-all');
});

test('admin hide and keep lists work, and keep always wins', async () => {
  const { c } = catalog({
    env: { MODEL_CATALOG_HIDE: 'openai:gpt-4o-mini, old-model-1', MODEL_CATALOG_KEEP: 'gpt-4-0613' },
    pages: { 'https://platform.openai.com/docs/deprecations': OPENAI_PAGE },
  });
  const r = await c.filterActiveModels('openai', ['gpt-4.1', 'gpt-4o-mini', 'gpt-4-0613', 'old-model-1']);
  assert.deepEqual(r.active, ['gpt-4.1', 'gpt-4-0613']);
  assert.deepEqual(r.hidden.map((x) => x.id).sort(), ['gpt-4o-mini', 'old-model-1']);
});

test('MODEL_CATALOG_ENABLED=false disables filtering', async () => {
  const { c, calls } = catalog({ env: { MODEL_CATALOG_ENABLED: 'false' }, pages: { 'https://platform.openai.com/docs/deprecations': OPENAI_PAGE } });
  const r = await c.filterActiveModels('openai', ['gpt-4-0613', 'gpt-4.1']);
  assert.deepEqual(r.active, ['gpt-4-0613', 'gpt-4.1']);
  assert.equal(calls.search, 0);
});

test('a failed refresh keeps the last good data and backs off', async () => {
  let fail = false; let searches = 0; let t = NOW;
  const records = new Map();
  const calls = { search: 0, fetch: 0 };
  const c = createModelCatalog({
    env: { GEMINI_API_KEY: 'k', MODEL_CATALOG_TTL_HOURS: '1' },
    now: () => t,
    store: { get: async (id) => records.get(id) || null, set: async (id, v) => { records.set(id, v); } },
    discover: discoverFrom({ pages: { [DOC_URL]: OPENAI_PAGE }, calls, search: async () => { searches += 1; if (fail) throw new Error('down'); return [{ url: DOC_URL }]; } }),
  });
  assert.deepEqual((await c.filterActiveModels('openai', ['gpt-4-0613', 'gpt-4.1'])).hidden.map((x) => x.id), ['gpt-4-0613']);
  fail = true; t += 2 * 3_600_000;
  const r = await c.filterActiveModels('openai', ['gpt-4-0613', 'gpt-4.1']);
  assert.deepEqual(r.hidden.map((x) => x.id), ['gpt-4-0613'], 'stale data still applied');
  await c.filterActiveModels('openai', ['gpt-4.1']);
  assert.equal(searches, 2, 'no retry storm inside the backoff window');
});

test('force refresh bypasses a fresh documentation cache when Fetch is clicked', async () => {
  let searches = 0;
  const { c } = catalog({ search: async () => { searches += 1; return [{ url: 'https://platform.openai.com/docs/deprecations' }]; } });
  await c.filterActiveModels('openai', ['gpt-4.1']);
  await c.filterActiveModels('openai', ['gpt-4.1']);
  assert.equal(searches, 1, 'normal fetches reuse fresh docs cache');
  await c.filterActiveModels('openai', ['gpt-4.1'], { force: true });
  assert.equal(searches, 2, 'explicit refresh checks official docs again');
});
