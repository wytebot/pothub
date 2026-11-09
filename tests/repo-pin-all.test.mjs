import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isReadOnlyCommand, readOnlyCwdOk } from '../src/lib/termux-actions.js';
import { createRepoFileSource } from '../src/lib/repo-files.js';
import { PIN_ALL_ITEM, isSyncablePath, repoContextNote, repoWorkspaceName, showPinAll } from '../src/lib/repo-mentions.js';
import { PHASE_LABEL, detectPhases, finishSteps, pushStep, shortCommand } from '../src/lib/agent-steps.js';
import { termuxToolInstruction } from '../server/termux-tool-prompt.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('only look-but-do-not-touch commands inside the workspace run automatically', () => {
  for (const ok of ['rg -n "billing" src | head -20', "sed -n '10,40p' src/ui/App.jsx", 'cat package.json', 'git ls-files | head', "rg 'foo$' src", 'grep -rn x . 2>/dev/null | head', 'ls -la server && wc -l server/app.js'])
    assert.equal(isReadOnlyCommand(ok), true, ok);
  for (const bad of ['rg foo > out.txt', 'cat ../x', 'cat /etc/passwd', 'cat ~/.ssh/id_rsa', 'find . -name "*.js" -exec rm {} \\;', 'find . -delete', 'npm test', 'echo $(whoami)', 'ls && rm -rf x', 'tail -f log', 'sed -i s/a/b/ f', "sed 's/a/b/' f", 'git push', 'git -c core.pager=sh log', 'rg --pre ./x foo', 'sort -o out in', 'ls; rm x', 'cat a & ', 'cat `id`', 'cat "$HOME/x"', 'bash -c ls'])
    assert.equal(isReadOnlyCommand(bad), false, bad);
});

test('auto-run only works in this repository\'s own Termux folder', () => {
  assert.equal(readOnlyCwdOk('', 'me__repo'), true);
  assert.equal(readOnlyCwdOk('~/.pothub/workspaces/me__repo', 'me__repo'), true);
  assert.equal(readOnlyCwdOk('~/.pothub/workspaces/me__repo/src', 'me__repo'), true);
  assert.equal(readOnlyCwdOk('~/.pothub/workspaces/other__repo', 'me__repo'), false);
  assert.equal(readOnlyCwdOk('~/.pothub/workspaces/me__repo/../other', 'me__repo'), false);
  assert.equal(readOnlyCwdOk('~', 'me__repo'), false);
});

test('syncToTermux copies readable source once, skips noise and secrets, and never mirrors', async () => {
  const bodies = { 'src/a.js': 'A', 'server/app.js': 'B', 'README.md': 'C', 'big.js': 'x'.repeat(500) };
  const api = async (p) => p.startsWith('/api/github/files')
    ? { files: ['src/a.js', 'server/app.js', 'README.md', 'big.js', 'logo.png', 'package-lock.json', '.env', '.env.example'].map((p) => ({ path: p })) }
    : { content: bodies[decodeURIComponent(/path=([^&]+)/.exec(p)[1])] ?? 'ENV_EXAMPLE' };
  const calls = [];
  const src = createRepoFileSource({ api, store: null });
  const sync = async (a) => { calls.push(a); };
  const r = await src.syncToTermux('me/repo', 'main', { sync, maxFileChars: 100 });
  assert.equal(r.workspace, 'me__repo');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mirror, false);
  assert.equal(calls[0].approved, true);
  assert.deepEqual(Object.keys(calls[0].files).sort(), ['.env.example', 'README.md', 'server/app.js', 'src/a.js']);
  assert.equal(r.skipped, 1);
  const again = await src.syncToTermux('me/repo', 'main', { sync });
  assert.equal(again.cached, true);
  assert.equal(calls.length, 1, 'a second message does not copy the repo again');
  src.forgetSync('me/repo');
  await src.syncToTermux('me/repo', 'main', { sync, maxFileChars: 100 });
  assert.equal(calls.length, 2);
});

test('the context note tells the agent how to read everything when pinned, and says so honestly when it cannot', () => {
  const ready = repoContextNote('me/repo', 'main', [], null, [], { workspace: 'me__repo', ready: true });
  assert.match(ready, /ALL FILES PINNED/);
  assert.match(ready, /~\/\.pothub\/workspaces\/me__repo/);
  assert.match(ready, /## Understanding, ## Investigation, ## Problem, ## Plan, ## Fix/);
  const down = repoContextNote('me/repo', 'main', [], null, [], { workspace: 'me__repo', ready: false, reason: 'Termux is not connected on this device' });
  assert.match(down, /could not be copied into Termux \(Termux is not connected on this device\)/);
  assert.doesNotMatch(down, /ALL FILES PINNED/);
});

test('helpers behind the @ list and workspace naming', () => {
  assert.equal(PIN_ALL_ITEM.pinAll, true);
  assert.equal(showPinAll(''), true); assert.equal(showPinAll('al'), true); assert.equal(showPinAll('app'), false);
  assert.equal(repoWorkspaceName('wytebot/pothub'), 'wytebot__pothub');
  assert.equal(isSyncablePath('.env'), false); assert.equal(isSyncablePath('src/x.png'), false); assert.equal(isSyncablePath('src/x.jsx'), true);
});

test('progress steps are real events or headings the model wrote, never filler', () => {
  assert.deepEqual(detectPhases('Sure.\n## Understanding\nx\n**Investigation**\nI searched\n## Plan\n'), ['understanding', 'investigation', 'plan']);
  assert.deepEqual(detectPhases('The plan is to fix it and the problem is clear.'), []);
  let s = pushStep([], 'Reading your request');
  s = pushStep(s, PHASE_LABEL.problem);
  assert.deepEqual(s.map((x) => x.status), ['done', 'active']);
  assert.equal(pushStep(s, PHASE_LABEL.problem), s);
  assert.deepEqual(finishSteps(s).map((x) => x.status), ['done', 'done']);
  assert.equal(shortCommand('rg -n "x"\nsecond line'), 'rg -n "x"');
});

test('server prompt only mentions the pinned repo for a safe workspace name', () => {
  assert.match(termuxToolInstruction({ available: true, workspace: 'me__repo', repoPinned: true }), /REPOSITORY PINNED[^]*me__repo/);
  assert.doesNotMatch(termuxToolInstruction({ available: true, workspace: 'a b;rm', repoPinned: true }), /PINNED/);
  assert.doesNotMatch(termuxToolInstruction({ available: true }), /PINNED/);
});

test('app wires pin-all: picker row, per-turn sync, auto-run of read-only steps, real step list', () => {
  const app = read('src/ui/App.jsx'), ws = read('src/ui/WorkspaceSection.jsx'), server = read('server/app.js');
  assert.match(app, /appRepoFiles\.syncToTermux\(/);
  assert.match(app, /isReadOnlyCommand\(termuxReq\.command\)&&readOnlyCwdOk\(termuxReq\.cwd,repoPin\.workspace\)/);
  assert.match(app, /autoRunSteps\.current<15/);
  assert.match(app, /repoStepsX|setRepoSteps/);
  assert.match(app, /toolResult\?'':text/, 'command output is not scanned for files to attach');
  assert.match(ws, /<AgentSteps steps=\{repoSteps\}\/>/);
  assert.match(ws, /onPinAll:\(\)=>\{setRepoPinned\(chatRepo,true\)/);
  assert.match(server, /workspace:z\.string\(\)\.regex\(\/\^\[A-Za-z0-9_\.-\]\{1,200\}\$\/\)\.optional\(\),repoPinned:z\.boolean\(\)\.optional\(\)/);
});
