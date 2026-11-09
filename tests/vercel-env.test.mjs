import test from 'node:test';
import assert from 'node:assert/strict';
import { assignedDomain, envDashboardUrl, firstProblem, fixBuildPrompt, githubStatusFrom, isBuilding, isFailed, linkedRepo, markSaved, needsVercelReauth, newRow, pendingRows, placeholdersFor, rowProblem, toPayload, toggleTarget } from '../src/lib/vercel-env.js';

const row = (key, value, sensitive = true, saved = false) => ({ ...newRow(), key, value, sensitive, saved });

test('suggestions are placeholders only and rows start empty', () => {
  const r = newRow();
  assert.equal(r.key, ''); assert.equal(r.value, ''); assert.equal(r.sensitive, true);
  assert.ok(placeholdersFor(0).name && placeholdersFor(1).value && placeholdersFor(99).name);
});

test('validation: names, values, NEXT_PUBLIC_ and duplicates', () => {
  assert.equal(rowProblem(row('', '')), '');
  assert.match(rowProblem(row('', 'x')), /name/);
  assert.match(rowProblem(row('1BAD', 'x')), /letters, numbers/);
  assert.match(rowProblem(row('OK', '')), /value/);
  assert.match(rowProblem(row('NEXT_PUBLIC_URL', 'x', true)), /non-sensitive/);
  assert.equal(rowProblem(row('NEXT_PUBLIC_URL', 'x', false)), '');
  const a = row('DUP', '1'), b = row('DUP', '2');
  assert.match(rowProblem(b, [a, b]), /already uses/);
  assert.equal(firstProblem([row('A', '1'), row('', '')]), '');
});

test('payload only has unsaved filled rows, and saving turns them grey and adds a fresh row', () => {
  const rows = [row('A', '1'), row('B', '2', false), row('', ''), row('OLD', '', true, true)];
  assert.deepEqual(toPayload(rows), [{ key: 'A', value: '1', secret: true }, { key: 'B', value: '2', secret: false }]);
  const after = markSaved(rows, ['A', 'B']);
  assert.equal(after.filter((r) => r.saved).length, 3);
  assert.ok(after.filter((r) => r.saved).every((r) => r.value === ''), 'values are dropped once saved');
  assert.equal(pendingRows(after).length, 0);
  assert.equal(after.at(-1).saved, false); assert.equal(after.at(-1).key, '');
});

test('links and domain', () => {
  assert.equal(envDashboardUrl({ id: 'prj_1', name: 'app', teamSlug: 'me' }), 'https://vercel.com/me/app/settings/environment-variables');
  assert.equal(envDashboardUrl({ id: 'prj_1', name: 'app' }), 'https://vercel.com/dashboard/project/prj_1/settings/environment-variables');
  assert.deepEqual(assignedDomain({ name: 'My-App', domains: [] }), { domain: 'my-app.vercel.app', confirmed: false });
  assert.deepEqual(assignedDomain({ name: 'x', domains: ['x.vercel.app'] }), { domain: 'x.vercel.app', confirmed: true });
  assert.equal(linkedRepo({ link: { repo: 'me/app' } }), 'me/app');
  assert.equal(linkedRepo({ link: { org: 'me', repo: 'app' } }), 'me/app');
  assert.equal(linkedRepo({}), '');
});

test('reauthorization is offered only when Vercel itself asks for verification', () => {
  assert.equal(needsVercelReauth(Object.assign(new Error('Verification required'), { code: 'VERCEL_REAUTH_REQUIRED' })), true);
  for (const e of [
    Object.assign(new Error("You don't have permission to create the project. (HTTP_403)"), { code: 'HTTP_403', status: 403 }),
    Object.assign(new Error('Vercel API returned 401'), { code: 'HTTP_401', status: 401 }),
    Object.assign(new Error('Vercel denied environment-variable access. Approve the scope request, then reauthorize.'), { code: 'VERCEL_ENV_SCOPE_REQUIRED', status: 403 }),
    new Error('token expired'), new Error('Verification required'), new Error('Connect your Vercel account to continue.'),
    new Error('Environment variable names must be unique'), new Error('Network request failed'), 'Verification required', null, undefined,
  ]) assert.equal(needsVercelReauth(e), false, String(e?.message || e));
});

test('build states', () => {
  assert.equal(isBuilding('building'), true); assert.equal(isBuilding('READY'), false);
  assert.equal(isFailed('ERROR'), true); assert.equal(isFailed('READY'), false);
});

test('the fix prompt names the repo, includes the logs, and asks for a changed-files-only ZIP', () => {
  const p = fixBuildPrompt({ repo: 'me/app', branch: 'main', project: 'app', deploymentId: 'dpl_123', logs: 'x'.repeat(20000) + 'REAL ERROR' });
  assert.match(p, /for me\/app \(branch main\), project app/);
  assert.match(p, /only the changed files/);
  assert.match(p, /REAL ERROR\n```$/);
  assert.ok(p.length < 13000);
  assert.match(fixBuildPrompt({ repo: 'a/b', logs: '' }), /no build log lines/);
});

test('GitHub is "not connected" only when the server says so, never because a request failed', () => {
  assert.equal(githubStatusFrom({ data: { repos: [] } }), 'connected');
  assert.equal(githubStatusFrom({ error: Object.assign(new Error('Connect GitHub as a Developer'), { code: 'GITHUB_ACCOUNT_REQUIRED' }) }), 'missing');
  assert.equal(githubStatusFrom({ error: new Error('Request timed out') }), 'error');
  assert.equal(githubStatusFrom({ error: new Error('Failed to fetch') }), 'error');
});

test('target toggle', () => {
  assert.deepEqual(toggleTarget(['production', 'preview'], 'preview'), ['production']);
  assert.deepEqual(toggleTarget(['production'], 'preview'), ['production', 'preview']);
});
