import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
test('AI candidate selection never builds routes from platform environment keys', () => {
  assert.match(app, /const userCandidates = Array\.isArray\(explicitCandidates\) \? explicitCandidates : requestAgentConfig\(req\)/);
  assert.match(app, /const candidates = userCandidates\.map/);
  assert.doesNotMatch(app, /process\.env\.GEMINI_API_KEY\s*\|\|/);
  assert.doesNotMatch(app, /process\.env\.AI_FALLBACK_API_KEY/);
  assert.match(app, /PotHub does not use platform-funded AI/);
});
test('failed user agent routes return a bounded BYOK-only diagnostic', () => {
  assert.match(app, /Your configured agent did not complete this request/);
  assert.match(app, /PotHub never substitutes a platform model/);
  assert.match(app, /interleaveAgentCandidates\(eligible,8\)/);
});
test('repository source remains GitHub-backed and Codelab does not implement server-side repository storage', () => {
  const codelab = fs.readFileSync(new URL('../src/ui/CodelabWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(app, /app\.post\('\/api\/github\/create-repo'/);
  assert.doesNotMatch(codelab, /localStorage\.setItem\(|indexedDB|upload.*repo/i);
});

test('frontend sends configured BYOK agents through round-robin model/key fallback', () => {
  const ui = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
  assert.match(ui, /import \{interleaveAgentCandidates,buildFallbackSequence\} from '\.\.\/lib\/agent-routing'/);
  assert.match(ui, /buildFallbackSequence\(primary,extra,8\)/);
  assert.match(ui, /const models=\[\.\.\.new Set\(\[a\.model,\.\.\.\(Array\.isArray\(a\.models\)/);
});
