import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');

test('chat replies no longer start with the "Using your Chat agent" line', () => {
  assert.ok(!/Using your Chat agent:\s*\$\{/.test(app));
  assert.match(app, /text:replyText\+fileNote,streaming:false/);
  assert.match(app, /replace\(\/\^Using your \[A-Za-z \]\{1,30\} agent:/); // legacy saved messages
});

test('GitHub callback reports the exact failing step and provider reason', () => {
  for (const code of ['github_bad_credentials', 'github_redirect_mismatch', 'state_cookie_invalid', 'session_handoff_failed']) {
    assert.ok(server.includes(code), code);
  }
  assert.match(server, /stage='token_exchange'/);
  assert.match(server, /GitHub token endpoint \(HTTP \$\{tr\.status\}\) returned/);
  assert.match(server, /profileInitError\?\.message/);
  assert.match(server, /auth_diag/);
});

test('Vercel redirect URI error names the URL and its source; diagnose endpoint exists', () => {
  assert.match(server, /function vercelRedirectSource\(req\)/);
  assert.match(server, /redirect_uri sent|redirectUriSent/);
  assert.match(server, /app\.get\('\/api\/auth\/diagnose'/);
  assert.match(server, /vercel_error:?/);
});

test('frontend decodes auth_diag and renders the sheet on both screens', () => {
  assert.match(app, /decodeAuthDiag/);
  assert.equal((app.match(/<AuthIssueSheet /g) || []).length, 2);
});
