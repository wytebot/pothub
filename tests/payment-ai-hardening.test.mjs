import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server/app.js', import.meta.url), 'utf8');

test('legacy GitHub commit endpoint is disabled rather than bypassing pinned scope approval', () => {
  const route = source.slice(source.indexOf("app.post('/api/github/commit-fix'"), source.indexOf("app.post('/api/github/revert-fix-branch'"));
  assert.match(route, /status\(410\)/);
  assert.match(route, /LEGACY_COMMIT_ROUTE_DISABLED/);
});

test('approved commit route requires explicit approval, immutable scope and base SHA', () => {
  const start = source.indexOf("app.post('/api/github/agent/commit-approved'");
  const end = source.indexOf("app.post('/api/github/commit-fix'", start);
  const route = source.slice(start, end);
  assert.match(route, /approved:\s*z\.literal\(true\)/);
  assert.match(route, /expectedBaseSha:\s*z\.string\(\)\.regex/);
  assert.match(route, /scopeClaim:\s*z\.string\(\)\.min/);
  assert.match(route, /validatePersistedCodelabScope/);
  assert.match(route, /base branch changed after review/);
});

test('pull request creation requires a persisted scope claim', () => {
  const start = source.indexOf("app.post('/api/github/create-pr'");
  const end = source.indexOf("app.post('/api/github/", start + 10);
  const route = source.slice(start, end < 0 ? undefined : end);
  assert.match(route, /scopeClaim:\s*z\.string\(\)\.min/);
  assert.match(route, /validatePersistedCodelabScope/);
});

test('Flutterwave webhook settles through the idempotent payment-reference ledger', () => {
  const start = source.indexOf("app.post('/api/webhooks/flutterwave'");
  const end = source.indexOf("app.get('/api/auth/device-seed'", start);
  const route = source.slice(start, end);
  assert.match(route, /isValidWebhookSecret/);
  assert.match(route, /isFreshWebhookTimestamp/);
  assert.match(route, /isVerifiedPayment/);
  assert.match(route, /await settleOrder\(o,String\(d\.id\)\)/);
  assert.doesNotMatch(route, /await addCredits\(/);
});

test('streaming creator prompt requires evidence-grounded answers and honest tool-use claims', () => {
  assert.match(source, /BYOK-only workspace/);
  assert.match(source, /Never claim you inspected files, called tools, generated media, ran tests, committed, or deployed/);
});

test('version endpoint exposes the source revision so deployments can be identified', () => {
  const route = source.slice(source.indexOf("app.get('/api/version'"), source.indexOf("app.get('/api/health'"));
  assert.match(route, /sourceRevision:'pothub-payment-ai-scope-hardening-2026-11-04-r1'/);
  assert.match(route, /Cache-Control/);
});
