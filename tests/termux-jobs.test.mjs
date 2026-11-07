import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createTermuxClient, makeTar, projectEntries, cleanTerminalText, redactSecrets, parsePoll, parseJobList,
  safeTarPath, bytesToBase64, base64ToBytes, assertJobId, newJobId, POLL_CHUNK_BYTES, safeWorkspaceName, MAX_INLINE_COMMAND_BYTES,
} from '../src/lib/termux-core.js';

// Fake Termux: runs the exact scripts the app sends through a real bash with HOME pointed at a temp dir.
function fakeTermux() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pothub-termux-'));
  const exec = ({ args, timeoutMs }) => new Promise((resolve, reject) => {
    const [flag, script, ...rest] = args;
    assert.equal(flag, '-c');
    const child = spawn('bash', ['-c', script, ...rest], { env: { ...process.env, HOME: home, PREFIX: '/usr' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code, err: -1 }));
    if (timeoutMs > 0) setTimeout(() => { child.kill(); reject(new Error('Termux did not respond (fake timeout)')); }, timeoutMs).unref();
  });
  return { home, exec, client: createTermuxClient({ exec }), cleanup: () => fs.rmSync(home, { recursive: true, force: true }) };
}
const fast = { pollMs: 80, maxPollMs: 200 };

test('probe reports connection and tools', async () => {
  const t = fakeTermux();
  try {
    const p = await t.client.probe();
    assert.equal(p.ok, true);
    assert.equal(p.home, t.home);
    assert.equal(p.tools.base64, true);
    assert.equal(p.tools.tar, true);
  } finally { t.cleanup(); }
});

test('run streams output live and reports a zero exit code', async () => {
  const t = fakeTermux();
  try {
    const chunks = [], states = [];
    const res = await t.client.run({ command: 'echo one; sleep 0.5; echo two; sleep 0.5; echo three', ...fast, onOutput: (c) => chunks.push(c), onState: (s) => states.push(s) });
    assert.equal(res.success, true);
    assert.equal(res.exitCode, 0);
    assert.equal(res.state, 'succeeded');
    assert.equal(res.output, 'one\ntwo\nthree\n');
    assert.ok(chunks.length >= 2, `expected live chunks, got ${chunks.length}`);
    assert.deepEqual(states.filter((s, i) => states.indexOf(s) === i), ['starting', 'running', 'succeeded']);
  } finally { t.cleanup(); }
});

test('run reports non-zero exit codes, merged stderr and shell metacharacters safely', async () => {
  const t = fakeTermux();
  try {
    const res = await t.client.run({ command: `echo "it's $((1+2)) \\"quoted\\""; echo oops >&2; exit 3`, ...fast });
    assert.equal(res.exitCode, 3);
    assert.equal(res.success, false);
    assert.equal(res.state, 'failed');
    assert.match(res.output, /it's 3 "quoted"/);
    assert.match(res.output, /oops/);
  } finally { t.cleanup(); }
});

test('cwd supports ~, relative, absolute; missing directory fails with a clear message', async () => {
  const t = fakeTermux();
  try {
    fs.mkdirSync(path.join(t.home, 'proj/sub'), { recursive: true });
    assert.equal((await t.client.run({ command: 'pwd', cwd: '~/proj', ...fast })).output.trim(), path.join(t.home, 'proj'));
    assert.equal((await t.client.run({ command: 'pwd', cwd: 'proj/sub', ...fast })).output.trim(), path.join(t.home, 'proj/sub'));
    assert.equal((await t.client.run({ command: 'pwd', cwd: path.join(t.home, 'proj'), ...fast })).output.trim(), path.join(t.home, 'proj'));
    assert.equal((await t.client.run({ command: 'pwd', ...fast })).output.trim(), t.home);
    const bad = await t.client.run({ command: 'pwd', cwd: 'nope', ...fast });
    assert.equal(bad.exitCode, 71);
    assert.match(bad.output, /cannot enter directory/);
  } finally { t.cleanup(); }
});

test('stop kills the whole process tree and reports stopped', async () => {
  const t = fakeTermux();
  try {
    const pidFile = path.join(t.home, 'child.pid');
    const ac = new AbortController();
    let jobId = '';
    const started = Date.now();
    const promise = t.client.run({
      command: `sh -c 'echo $$ > "${pidFile}"; exec sleep 60' & wait`,
      signal: ac.signal, ...fast, onStart: (id) => { jobId = id; },
    });
    await new Promise((r) => { const iv = setInterval(() => { if (fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').trim()) { clearInterval(iv); r(); } }, 50); });
    ac.abort();
    const res = await promise;
    assert.equal(res.stopped, true);
    assert.equal(res.state, 'stopped');
    assert.equal(res.success, false);
    assert.ok(Date.now() - started < 15000, 'stop must not wait for the 60s sleep');
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    await new Promise((r) => setTimeout(r, 300));
    assert.throws(() => process.kill(pid, 0), /ESRCH/, 'grandchild must be dead');
    assert.match(jobId, /^pj_/);
  } finally { t.cleanup(); }
});

test('multi-byte output is reassembled exactly across chunk boundaries', async () => {
  const t = fakeTermux();
  try {
    const line = 'héllo wörld ✓ 日本語';
    const lines = 9000;
    const res = await t.client.run({ command: `yes '${line}' | head -n ${lines}`, ...fast });
    assert.equal(res.success, true);
    assert.equal(res.output, `${line}\n`.repeat(lines));
    assert.ok(Buffer.byteLength(res.output) > POLL_CHUNK_BYTES * 3, 'must exceed several poll chunks');
  } finally { t.cleanup(); }
});

test('list shows jobs and follow can re-attach to a finished job from offset 0', async () => {
  const t = fakeTermux();
  try {
    let id = '';
    await t.client.run({ command: 'echo attach-me', ...fast, onStart: (v) => { id = v; } });
    const jobs = await t.client.list();
    assert.equal(jobs[0].id, id);
    assert.equal(jobs[0].state, 'exited');
    assert.equal(jobs[0].exitCode, 0);
    const again = await t.client.follow(id, { ...fast });
    assert.equal(again.output, 'attach-me\n');
    await assert.rejects(() => t.client.follow('pj_missing_job_00', { ...fast }), /no record/);
  } finally { t.cleanup(); }
});

test('a runner that fails to launch fails fast instead of hanging', async () => {
  const exec = async ({ timeoutMs }) => { if (timeoutMs === 0) throw new Error('permission denied'); return { stdout: 'state=missing\n' }; };
  const client = createTermuxClient({ exec });
  const started = Date.now();
  await assert.rejects(() => client.run({ command: 'echo hi', ...fast, startTimeoutMs: 20000 }), /permission denied/);
  assert.ok(Date.now() - started < 5000);
});

test('cleanup removes only finished old jobs', async () => {
  const t = fakeTermux();
  try {
    let id = '';
    await t.client.run({ command: 'true', ...fast, onStart: (v) => { id = v; } });
    const dir = path.join(t.home, '.pothub/jobs', id);
    const old = new Date(Date.now() - 10 * 86400000);
    fs.utimesSync(dir, old, old);
    await t.client.cleanup(3);
    assert.equal(fs.existsSync(dir), false);
  } finally { t.cleanup(); }
});

test('makeTar produces archives GNU tar extracts byte-for-byte (incl. long and unicode paths)', () => {
  const longDir = 'a'.repeat(60) + '/' + 'b'.repeat(60) + '/' + 'c'.repeat(60);
  const files = {
    'README.md': '# hi\n',
    'src/ünï/ファイル.js': 'export const x = 1;\n',
    [`${longDir}/deep.txt`]: 'deep',
    'empty.txt': '',
    'bin/data.bin': { __wydevBinary: true, base64: bytesToBase64(Uint8Array.from([0, 1, 2, 250, 251, 252, 255])) },
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pothub-tar-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.tar'), makeTar(projectEntries(files)));
    const out = path.join(dir, 'out'); fs.mkdirSync(out);
    const r = spawnSync('tar', ['-xf', path.join(dir, 'a.tar'), '-C', out, '--no-same-owner']);
    assert.equal(r.status, 0, String(r.stderr));
    assert.equal(fs.readFileSync(path.join(out, 'README.md'), 'utf8'), '# hi\n');
    assert.equal(fs.readFileSync(path.join(out, 'src/ünï/ファイル.js'), 'utf8'), 'export const x = 1;\n');
    assert.equal(fs.readFileSync(path.join(out, longDir, 'deep.txt'), 'utf8'), 'deep');
    assert.equal(fs.readFileSync(path.join(out, 'empty.txt'), 'utf8'), '');
    assert.deepEqual([...fs.readFileSync(path.join(out, 'bin/data.bin'))], [0, 1, 2, 250, 251, 252, 255]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('unsafe archive paths are rejected', () => {
  for (const bad of ['../evil', '/abs', 'a/../b', 'a//b'.replace('//', '/../')]) assert.throws(() => safeTarPath(bad), /Unsafe path/);
  assert.equal(safeTarPath('./ok\\sub\\file.txt'), 'ok/sub/file.txt');
});

test('writeProject uploads in chunks, mirrors, and keeps node_modules and .git', async () => {
  const t = fakeTermux();
  try {
    const big = 'x'.repeat(350000); // forces multiple upload chunks
    const progress = [];
    const first = await t.client.writeProject({ name: 'me/repo main', files: { 'package.json': '{}', 'big.txt': big, 'old.txt': 'stale' }, onProgress: (p) => progress.push(p) });
    assert.ok(progress.length >= 3, 'multiple chunks expected');
    assert.equal(first.files, 3);
    const ws = first.workspace;
    assert.ok(ws.startsWith(path.join(t.home, '.pothub/workspaces')));
    assert.equal(fs.readFileSync(path.join(ws, 'big.txt'), 'utf8').length, 350000);
    fs.mkdirSync(path.join(ws, 'node_modules/pkg'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'node_modules/pkg/index.js'), 'keep');
    await t.client.writeProject({ name: 'me/repo main', files: { 'package.json': '{"v":2}' }, mirror: true });
    assert.equal(fs.readFileSync(path.join(ws, 'package.json'), 'utf8'), '{"v":2}');
    assert.equal(fs.existsSync(path.join(ws, 'old.txt')), false, 'mirror removes stale files');
    assert.equal(fs.readFileSync(path.join(ws, 'node_modules/pkg/index.js'), 'utf8'), 'keep');
    assert.equal(fs.readdirSync(path.join(t.home, '.pothub/uploads')).length, 0, 'upload temp files are removed');
  } finally { t.cleanup(); }
});

test('commands larger than one argv entry are shipped as a script file and still run', async () => {
  const t = fakeTermux();
  try {
    const command = `echo big-command-ok\n# ${'x'.repeat(MAX_INLINE_COMMAND_BYTES + 50000)}\necho second-line`;
    const res = await t.client.run({ command, ...fast });
    assert.equal(res.success, true, res.output);
    assert.equal(res.output, 'big-command-ok\nsecond-line\n');
  } finally { t.cleanup(); }
});

test('workspace names are filesystem safe', () => {
  assert.equal(safeWorkspaceName('me/repo main'), 'me_repo_main');
  assert.equal(safeWorkspaceName('../../etc'), '_.._etc'.replace('_.._', '_.._'));
  assert.ok(!safeWorkspaceName('../x').startsWith('.'));
  assert.equal(safeWorkspaceName(''), '');
});

test('text helpers', () => {
  assert.equal(cleanTerminalText('\u001b[32mok\u001b[0m\nprogress 10%\rprogress 100%\ndone'), 'ok\nprogress 100%\ndone');
  assert.equal(redactSecrets('token ghp_abcdefghijklmnopqrstuvwxyz0123456789 and Bearer abcdefghijklmnop'), 'token [REDACTED] and Bearer [REDACTED]');
  assert.deepEqual(base64ToBytes(bytesToBase64(Uint8Array.from([1, 2, 3, 255]))), Uint8Array.from([1, 2, 3, 255]));
  const poll = parsePoll('state=exited\nexit=0\nsize=5\nstopped=0\nbody=aGVsbG8=\n');
  assert.equal(new TextDecoder().decode(poll.bytes), 'hello');
  assert.equal(poll.exitCode, 0);
  assert.deepEqual(parseJobList('pj_abcdef12|running||1700000000|npm test\nnot-a-job|x||'), [{ id: 'pj_abcdef12', state: 'running', exitCode: null, startedAt: 1700000000000, command: 'npm test' }]);
  assert.throws(() => assertJobId('../../etc'), /Invalid/);
  assert.doesNotThrow(() => assertJobId(newJobId()));
});

test('native bridge and Android wiring are in place', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const java = (n) => fs.readFileSync(path.join(root, 'android-template/app/src/main/java/app/kithub/ai', n), 'utf8');
  const receiver = java('TermuxResultReceiver.java');
  assert.match(receiver, /getBundleExtra/, 'Termux returns results inside a Bundle extra');
  assert.match(receiver, /exitCode/);
  const plugin = java('TermuxRuntimePlugin.java');
  for (const m of ['status', 'requestPermission', 'exec', 'openTermux']) assert.match(plugin, new RegExp(`public void ${m}\\(`), `plugin method ${m}`);
  assert.match(plugin, /com\.termux\.permission\.RUN_COMMAND/);
  const configure = fs.readFileSync(path.join(root, 'scripts/configure-android.mjs'), 'utf8');
  for (const needle of ['TermuxRuntimePlugin', 'TermuxResultReceiver', 'com.termux.permission.RUN_COMMAND', '<queries>']) assert.ok(configure.includes(needle), `scripts/configure-android.mjs must wire ${needle}`);
});
