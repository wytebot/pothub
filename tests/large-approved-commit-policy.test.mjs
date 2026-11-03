import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
const routeStart = source.indexOf("app.post('/api/github/agent/commit-approved'");
const routeEnd = source.indexOf("app.post('/api/github/commit-fix'", routeStart);
const route = source.slice(routeStart, routeEnd);

test('approved agent commits are bounded to reviewable multi-commit batches', () => {
  assert.ok(route.includes('files: z.array(fileSchema).min(1).max(80)'));
  assert.ok(route.includes('offset += 12'));
  assert.ok(route.includes('commitsCreated: batches.length'));
  assert.ok(route.includes('pullRequestRequired: true'));
});

test('approved agent commits verify the reviewed base SHA before writing', () => {
  assert.ok(route.includes('expectedBaseSha'));
  assert.ok(route.includes('base branch changed after review'));
  assert.ok(route.includes('/git/commits/${i.expectedBaseSha}`'));
});

test('approved agent commits accept binary-safe base64 blobs and cap total payload size', () => {
  assert.ok(route.includes("z.enum(['utf-8', 'base64'])"));
  assert.ok(route.includes("encoding: 'base64'"));
  assert.ok(route.includes('totalBytes > 2500000'));
  assert.ok(route.includes('100 MB limit'));
  assert.ok(route.includes('50 MB review limit'));
});

test('partial multi-commit failures report the review branch and committed files', () => {
  assert.ok(route.includes('partial review branch may exist'));
  assert.ok(route.includes('committedFiles.length'));
});
