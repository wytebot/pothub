import test from 'node:test';
import assert from 'node:assert/strict';
import { isExcludedRepoPath, assertSafeRepoPath } from '../server/path-policy.js';
test('directory exclusions are segment anchored', () => {
  for (const p of ['dist/main.js','src/build/app.js','coverage/report.json','node_modules/x.js','.next/server.js']) assert.equal(isExcludedRepoPath(p), true, p);
  for (const p of ['src/distance.js','src/builder.ts','src/coverage-utils.js','src/my-secretary.js']) assert.equal(isExcludedRepoPath(p), false, p);
});
test('rejects traversal, absolute, env, and private key paths', () => {
  for (const p of ['/tmp/a.js','../a.js','src/../x.js','.env','config/.env.production','keys/private-key.pem']) assert.equal(isExcludedRepoPath(p), true, p);
  assert.equal(assertSafeRepoPath('src/App.jsx'), 'src/App.jsx');
  assert.throws(() => assertSafeRepoPath('../oops.js'));
});
