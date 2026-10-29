import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/ui/App.jsx',import.meta.url),'utf8');
test('URL cleanup uses the browser History API, not the local run-history state array',()=>{
  assert.match(app,/window\.history\.replaceState\(/);
  assert.doesNotMatch(app,/(?<!window\.)\bhistory\.replaceState\(/);
});
