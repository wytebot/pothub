import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression guard: the client must call API paths relative to apiBase(), which already
// supplies the /api prefix. A literal '/api/...' path would become /api/api/... at runtime.
const app = readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
const apiJs = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8');

test('api.js defines and uses apiBase()', () => {
  assert.match(apiJs, /export function apiBase\(\)/);
  assert.match(apiJs, /\$\{apiBase\(\)\}\$\{path\}/);
  assert.match(apiJs, /normalized \? \(\/\\\/api\$\/i\.test\(normalized\) \? normalized : `\$\{normalized\}\/api`\) : '\/api'/);
});

test('no api() call hard-codes the /api prefix', () => {
  const literalCalls = [...app.matchAll(/api\(\s*['"`]\/api\//g)];
  assert.equal(literalCalls.length, 0, 'found api("/api/...") calls that would double the prefix');
});

test('pricing loads without a blocking error toast', () => {
  assert.match(app, /api\('\/pricing'\)/);
  assert.doesNotMatch(app, /Pricing could not be loaded\. Refresh to retry\./);
});
