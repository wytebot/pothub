import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import Docker from 'dockerode';
import { detectEngine, safeArchivePath, type Check } from './engine.js';
import unzipper from 'unzipper'; import { pipeline } from 'node:stream/promises'; import { createWriteStream } from 'node:fs'; import { Readable, PassThrough } from 'node:stream';

const PORT = Number(process.env.PORT ?? 8788);
const TOKEN = process.env.ENGINE_RUNNER_TOKEN ?? '';
const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET ?? '/var/run/docker.sock' });
const MAX_ARCHIVE = 6 * 1024 * 1024;
const MAX_FILES = 1500;
const MAX_EXTRACTED = 30 * 1024 * 1024;
const MAX_FILE = 5 * 1024 * 1024;
let activeRuns = 0; const MAX_CONCURRENT_RUNS = 2;
const TIMEOUT_MS = Math.min(180_000, Math.max(30_000, Number(process.env.RUNNER_TIMEOUT_MS ?? 120_000)));
const compareToken = (candidate: string) => {
  if (!TOKEN) return false;
  const a = Buffer.from(candidate); const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
};
const readBody = (req: import('node:http').IncomingMessage, max = 8_500_000) => new Promise<Buffer>((resolve, reject) => {
  let size = 0; const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => { size += c.length; if (size > max) { reject(new Error('Request too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
});
const cleanLog = (s: string) => s.replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s]+/gi, '$1=[redacted]').slice(0, 18_000);
const parseChecks = (output: string): Check[] => output.split(/\r?\n/).filter((l) => /^\[(PASS|FAIL|SKIP)\]/.test(l)).map((l) => ({ status: l.startsWith('[PASS]') ? 'pass' : l.startsWith('[FAIL]') ? 'fail' : 'skip', name: l.slice(6, 180).trim(), detail: undefined }));
async function executeContainer(image: string, command: string[], workspace: string, network: 'none' | 'bridge', timeoutMs: number) {
  const container = await docker.createContainer({ Image: image, Cmd: command, WorkingDir: '/workspace', User: '0:0', Env: ['HOME=/home/runner'], AutoRemove: false,
    HostConfig: { Binds: [`${workspace}:/workspace:rw`], NetworkMode: network, Memory: 1_000_000_000, MemorySwap: 1_000_000_000, NanoCpus: 1_000_000_000, PidsLimit: 192, ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=256m', '/home/runner': 'rw,noexec,nosuid,size=128m' } } });
  let timedOut = false; let timer: ReturnType<typeof setTimeout> | undefined; let timeoutResolve: ((value: { StatusCode: number }) => void) | undefined;
  const timeoutPromise = new Promise<{ StatusCode: number }>((resolve) => { timeoutResolve = resolve; });
  try {
    await container.start(); timer = setTimeout(() => { timedOut = true; void container.kill().catch(() => {}); timeoutResolve?.({ StatusCode: 124 }); }, timeoutMs); let status: any;
    try { status = await Promise.race([container.wait(), timeoutPromise]); } catch { status = { StatusCode: 125 }; }
    const rawLogs = await container.logs({ stdout: true, stderr: true }).catch(() => null); let output = '';
    if (rawLogs) { const logStream = Buffer.isBuffer(rawLogs) ? Readable.from([rawLogs]) : rawLogs; output = await new Promise<string>((resolve) => { const out = new PassThrough(); const err = new PassThrough(); const add = (chunk: Buffer) => { output += chunk.toString('utf8'); if (output.length > 22_000) output = output.slice(-22_000); }; out.on('data', add); err.on('data', add); logStream.on('end', () => resolve(cleanLog(output))); logStream.on('error', () => resolve(cleanLog(output))); docker.modem.demuxStream(logStream, out, err); }); }
    return { exitCode: Number(status?.StatusCode ?? 125), output, timedOut };
  } finally { if (timer) clearTimeout(timer); await container.remove({ force: true }).catch(() => {}); }
}

async function runArchive(archive64: string) {
  if (archive64.length > Math.ceil(MAX_ARCHIVE * 4 / 3) + 128) throw new Error('Project archive exceeds the 6 MB sandbox limit.');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(archive64)) throw new Error('Project archive is not valid base64.');
  const archive = Buffer.from(archive64, 'base64'); if (archive.length > MAX_ARCHIVE) throw new Error('Project archive exceeds the 6 MB sandbox limit.');
  const workspace = await mkdtemp(join(tmpdir(), 'pothub-engine-'));
  let total = 0; const names: string[] = []; let fileCount = 0;
  try {
    const parser = unzipper.Parse({ forceStream: true }); const tasks: Promise<void>[] = [];
    parser.on('entry', (entry: any) => {
      const task = (async () => { try {
        const p = safeArchivePath(entry.path);
        if (!p || entry.type !== 'File' || /(^|\/)(node_modules|vendor|\.git|\.dart_tool|\.gradle)(\/|$)/i.test(p)) { entry.autodrain(); return; }
        if (++fileCount > MAX_FILES) { entry.autodrain(); throw new Error('Project archive has too many files for the sandbox.'); }
        const expected = Number(entry.vars?.uncompressedSize ?? 0);
        if (expected > MAX_FILE) { entry.autodrain(); throw new Error(`File too large for sandbox: ${p}`); }
        // Never place secrets in a disposable build workspace.
        if (/(^|\/)(\.env(?:\.[^/]+)?|.*(?:service[-_]?account|credentials|secrets?)\.json|id_rsa|id_ed25519|.*\.pem|.*\.key)$/i.test(p)) { entry.autodrain(); return; }
        total += expected; if (total > MAX_EXTRACTED) { entry.autodrain(); throw new Error('Expanded project exceeds the 30 MB sandbox limit.'); }
        const target = join(workspace, ...p.split('/')); await mkdir(join(target, '..'), { recursive: true });
        await pipeline(entry, createWriteStream(target, { flags: 'wx' })); names.push(p);
      } catch (e) { entry.autodrain?.(); throw e; } })(); tasks.push(task); task.catch((e) => parser.destroy(e instanceof Error ? e : new Error('Archive extraction failed')));
    });
    await pipeline(Readable.from(archive), parser); await Promise.all(tasks);
    const plan = detectEngine(names, { nodeImage: process.env.RUNNER_IMAGE, flutterImage: process.env.RUNNER_FLUTTER_IMAGE });
    const image = plan.image; const started = Date.now(); let preChecks: Check[] = [];
    if (names.includes('package.json')) {
      const install = await executeContainer(image, ['/bin/sh', '-lc', 'if [ -f package-lock.json ]; then npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/npm-cache; else npm install --ignore-scripts --no-audit --no-fund --cache /tmp/npm-cache; fi'], workspace, 'bridge', Math.min(60_000, TIMEOUT_MS));
      preChecks.push({ name: install.exitCode === 0 && !install.timedOut ? 'Node dependencies installed (install scripts disabled)' : 'Node dependency installation', status: install.exitCode === 0 && !install.timedOut ? 'pass' : 'skip', detail: install.exitCode === 0 && !install.timedOut ? undefined : 'Dependency installation was blocked or timed out; build/test checks may be skipped.' });
    }
    if (names.includes('pubspec.yaml') || names.some((n) => n.endsWith('/pubspec.yaml'))) {
      const flutterInstall = await executeContainer(image, ['/bin/sh', '-lc', 'flutter pub get'], workspace, 'bridge', Math.min(60_000, TIMEOUT_MS));
      preChecks.push({ name: flutterInstall.exitCode === 0 && !flutterInstall.timedOut ? 'Flutter dependencies fetched' : 'Flutter dependency installation', status: flutterInstall.exitCode === 0 && !flutterInstall.timedOut ? 'pass' : 'skip', detail: flutterInstall.exitCode === 0 && !flutterInstall.timedOut ? undefined : 'Flutter packages could not be fetched; analyze/test may be skipped.' });
    }
    const check = await executeContainer(image, ['/usr/local/bin/pothub-check'], workspace, 'none', TIMEOUT_MS);
    const executionChecks = parseChecks(check.output); if (!executionChecks.length) executionChecks.push({ name: check.exitCode === 0 && !check.timedOut ? 'No supported project checks executed' : 'Sandbox check process', status: check.exitCode === 0 && !check.timedOut ? 'skip' : 'fail', detail: check.timedOut ? 'The project exceeded the execution time limit.' : check.exitCode === 0 ? 'No compatible project checks were detected.' : `Check process exited with code ${check.exitCode}.` });
    if (check.exitCode !== 0 && !executionChecks.some((c) => c.status === 'fail')) executionChecks.push({ name: 'Sandbox check process', status: 'fail', detail: `Check process exited with code ${check.exitCode}.` });
    const checks = [...preChecks, ...executionChecks];
    if (check.timedOut && !checks.some((c) => c.name === 'Sandbox timeout')) checks.push({ name: 'Sandbox timeout', status: 'fail', detail: 'The project exceeded the execution time limit.' });
    return { engine: plan.labels, checks, durationMs: Date.now() - started, output: cleanLog(check.output), success: executionChecks.some((c) => c.status === 'pass') && checks.every((c) => c.status !== 'fail') };

  } finally { await rm(workspace, { recursive: true, force: true }); }
}

createServer(async (req, res) => {
  const send = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  try {
    if (req.method === 'GET' && req.url === '/health') { try { await docker.ping(); return send(200, { status: 'ok', service: 'pothub-isolated-runner', docker: 'ready' }); } catch { return send(503, { status: 'unavailable', service: 'pothub-isolated-runner', docker: 'offline' }); } }
    if (req.method !== 'POST' || req.url !== '/run') return send(404, { error: 'Not found' });
    if (!compareToken((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))) return send(401, { error: 'Unauthorized runner request.' });
    if (activeRuns >= MAX_CONCURRENT_RUNS) return send(429, { error: 'Sandbox capacity is busy. Retry shortly.' });
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}') as { archive?: unknown };
    if (typeof body.archive !== 'string' || !body.archive) return send(400, { error: 'A base64 project archive is required.' });
    activeRuns++; try { const result = await runArchive(body.archive); return send(200, result); } finally { activeRuns--; }
  } catch (e) { const msg = e instanceof Error ? e.message : 'Sandbox run failed.'; return send(msg === 'Request too large' ? 413 : /zip|archive|limit|too large|invalid/i.test(msg) ? 400 : 500, { error: msg }); }
}).listen(PORT, () => console.log(`Pothub sandbox runner on :${PORT}`));
