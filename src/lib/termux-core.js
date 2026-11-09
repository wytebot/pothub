// Termux execution core. Dependency-free (no Capacitor import) so it can be unit-tested in Node with a
// fake `exec` that runs the very same shell scripts through a real bash.
//
// Why file-backed jobs: Termux's RUN_COMMAND intent only hands stdout back when a command *finishes*.
// To stream live, every command runs as a "job" whose combined output is written to
// $HOME/.pothub/jobs/<id>/out inside Termux, and the app polls that file with short background
// commands (each returns a base64 chunk + state). The same files give us a real kill (process-group
// signal), exit codes, and the ability to re-attach after PotHub is restarted.

export const TERMUX_PREFIX = '/data/data/com.termux/files/usr';
export const TERMUX_HOME = '/data/data/com.termux/files/home';
export const TERMUX_BASH = `${TERMUX_PREFIX}/bin/bash`;
export const JOBS_DIR = '.pothub/jobs';
export const WORKSPACES_DIR = '.pothub/workspaces';
export const UPLOADS_DIR = '.pothub/uploads';

/** Largest raw chunk read from a job log per poll (base64 of this stays far below Termux's 100 KB result cap). */
export const POLL_CHUNK_BYTES = 49152;
/**
 * Raw bytes per upload call. Divisible by 3 so every chunk is independently valid base64, and small enough that the
 * base64 argument (128,000 chars) stays under Linux's 131,072-byte limit for any single argv entry.
 */
export const UPLOAD_CHUNK_BYTES = 96000;
/** Commands larger than this (bytes) are uploaded as a script file instead of being passed as one argv entry. */
export const MAX_INLINE_COMMAND_BYTES = 100000;
/** Client-side memory guard for one run's retained text. The complete log always stays in Termux. */
export const RETAINED_OUTPUT_CHARS = 5_000_000;

const JOB_ID = /^pj_[a-z0-9_]{6,64}$/;
export const newJobId = () => `pj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
export function assertJobId(id) {
  if (!JOB_ID.test(String(id || ''))) throw new Error('Invalid Termux job id.');
  return String(id);
}

// ---------------------------------------------------------------------------------------------
// Shell scripts. Always passed as `bash -c SCRIPT pothub <positional args>` so user data (commands,
// paths, base64) travels as argv and is never interpolated into script text.
// ---------------------------------------------------------------------------------------------

const CWD_RESOLVE = String.raw`case "$CWD" in ''|'~') CWD="$HOME";; '~/'*) CWD="$HOME/\${CWD#'~/'}";; /*) ;; *) CWD="$HOME/$CWD";; esac`.replace('\\$', '$');

/** Long-lived runner: stays alive for the whole command, so Termux keeps its service in the foreground. $1=id $2=cwd $3=command */
export const RUNNER_SCRIPT = String.raw`
J="$HOME/${JOBS_DIR}/$1"; CWD="$2"
mkdir -p "$J" || exit 70
rm -f "$J/exit" "$J/exit.tmp" "$J/stopped"
: > "$J/out"
printf '%s' "$3" > "$J/cmd"
date +%s > "$J/start"
${CWD_RESOLVE}
if ! cd -- "$CWD" 2>/dev/null; then
  echo "pothub: cannot enter directory $CWD" >> "$J/out"
  echo 71 > "$J/exit"; exit 71
fi
export PAGER=cat GIT_PAGER=cat GIT_TERMINAL_PROMPT=0 DEBIAN_FRONTEND=noninteractive
set -m
bash -c "$3" >> "$J/out" 2>&1 < /dev/null &
CH=$!
echo "$CH" > "$J/pid"
trap 'kill -TERM -- -"$CH" 2>/dev/null' TERM HUP INT
RC=0
while kill -0 "$CH" 2>/dev/null; do wait "$CH"; RC=$?; done
echo "$RC" > "$J/exit.tmp" && mv "$J/exit.tmp" "$J/exit"
exit "$RC"
`.trim();

/** One poll. $1=id $2=byte offset $3=max bytes. State is read BEFORE size so a terminal state implies final size. */
export const POLL_SCRIPT = String.raw`
J="$HOME/${JOBS_DIR}/$1"; O="\${2:-0}"; M="\${3:-${POLL_CHUNK_BYTES}}"
if [ ! -d "$J" ]; then echo "state=missing"; exit 0; fi
S=starting; E=""
if [ -f "$J/exit" ]; then S=exited; E="$(cat "$J/exit" 2>/dev/null)"
elif [ -f "$J/pid" ]; then
  if kill -0 "$(cat "$J/pid" 2>/dev/null)" 2>/dev/null; then S=running
  else sleep 0.4; if [ -f "$J/exit" ]; then S=exited; E="$(cat "$J/exit" 2>/dev/null)"; else S=lost; fi; fi
fi
SZ="$(stat -c %s "$J/out" 2>/dev/null || echo 0)"
ST=0; [ -f "$J/stopped" ] && ST=1
echo "state=$S"; echo "exit=$E"; echo "size=$SZ"; echo "stopped=$ST"
printf 'body='; tail -c +$((O+1)) "$J/out" 2>/dev/null | head -c "$M" | base64 -w0; echo
`.replace(/\\\$/g, '$').trim();

/** Terminate the whole process group of a job. $1=id */
export const STOP_SCRIPT = String.raw`
J="$HOME/${JOBS_DIR}/$1"
[ -f "$J/pid" ] || { echo "stopped=0"; exit 0; }
P="$(cat "$J/pid" 2>/dev/null)"
touch "$J/stopped"
kill -TERM -- -"$P" 2>/dev/null || kill -TERM "$P" 2>/dev/null
for i in 1 2 3 4 5 6; do kill -0 "$P" 2>/dev/null || break; sleep 0.5; done
if kill -0 "$P" 2>/dev/null; then kill -KILL -- -"$P" 2>/dev/null || kill -KILL "$P" 2>/dev/null; fi
echo "stopped=1"
`.trim();

/** List jobs (newest first): id|state|exit|start|cmd(first line, 120 chars). */
export const LIST_SCRIPT = String.raw`
D="$HOME/${JOBS_DIR}"; [ -d "$D" ] || exit 0
for J in $(ls -1t "$D" 2>/dev/null | head -40); do
  P="$D/$J"; [ -d "$P" ] || continue
  if [ -f "$P/exit" ]; then S=exited; E="$(cat "$P/exit")"
  elif [ -f "$P/pid" ] && kill -0 "$(cat "$P/pid")" 2>/dev/null; then S=running; E=""
  elif [ -f "$P/pid" ]; then S=lost; E=""
  else S=starting; E=""; fi
  C="$(head -n 1 "$P/cmd" 2>/dev/null | cut -c1-120 | tr '|' ' ')"
  echo "$J|$S|$E|$(cat "$P/start" 2>/dev/null)|$C"
done
`.trim();

/** Remove finished job directories older than $1 days. */
export const CLEAN_SCRIPT = String.raw`
D="$HOME/${JOBS_DIR}"; [ -d "$D" ] || exit 0
find "$D" -mindepth 1 -maxdepth 1 -type d -mtime +"\${1:-3}" 2>/dev/null | while read -r P; do
  [ -f "$P/exit" ] && rm -rf "$P"
done
find "$HOME/${UPLOADS_DIR}" -type f -mtime +1 -delete 2>/dev/null
echo ok
`.replace(/\\\$/g, '$').trim();

/** Connection + tooling probe. */
export const PROBE_SCRIPT = String.raw`
echo "pothub=ok"; echo "home=$HOME"; echo "prefix=\${PREFIX:-}"; echo "bash=\${BASH_VERSION:-}"
for t in base64 tar git node npm python python3 pkg curl unzip; do
  if command -v "$t" >/dev/null 2>&1; then echo "tool.$t=1"; else echo "tool.$t=0"; fi
done
`.replace(/\\\$/g, '$').trim();

/** Append one base64 chunk to an upload file. $1=upload id $2=base64 $3=extension (tar|cmd) */
export const UPLOAD_CHUNK_SCRIPT = String.raw`
mkdir -p "$HOME/${UPLOADS_DIR}" || exit 70
case "\${3:-tar}" in tar|cmd) ;; *) exit 64;; esac
printf '%s' "$2" | base64 -d >> "$HOME/${UPLOADS_DIR}/$1.\${3:-tar}" || exit 71
echo ok
`.replace(/\\\$/g, '$').trim();

/** Unpack an upload into a workspace. $1=upload id $2=workspace name $3=mirror(0|1). Refuses to leave the workspaces root. */
export const EXTRACT_SCRIPT = String.raw`
T="$HOME/${UPLOADS_DIR}/$1.tar"; N="$2"; R="$HOME/${WORKSPACES_DIR}"
case "$N" in ''|*/*|.|..) echo "bad workspace name"; exit 64;; esac
D="$R/$N"; mkdir -p "$D" || exit 70
if [ "$3" = "1" ]; then find "$D" -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .git -exec rm -rf {} + 2>/dev/null; fi
tar -xf "$T" -C "$D" --no-same-owner; RC=$?
rm -f "$T"
[ "$RC" = "0" ] || { echo "tar failed ($RC)"; exit "$RC"; }
echo "workspace=$D"
`.trim();

// ---------------------------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------------------------

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export function base64ToBytes(b64) {
  const clean = String(b64 || '').replace(/\s+/g, '');
  if (!clean) return new Uint8Array(0);
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const SECRET_PATTERNS = [
  [/gh[pousr]_[A-Za-z0-9_]{20,}/g, '[REDACTED]'],
  [/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]'],
  [/\b(?:sk|rk|pk|xai|gsk|pplx|r8|key|fw|hf)[-_][A-Za-z0-9_-]{16,}/gi, '[REDACTED]'],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [REDACTED]'],
];
/** Mask well-known key shapes before output is stored in app logs. */
export const redactSecrets = (text) => SECRET_PATTERNS.reduce((t, [re, to]) => t.replace(re, to), String(text ?? ''));

/** Terminal output -> readable text: strip ANSI escapes, collapse carriage-return progress lines. */
export function cleanTerminalText(text) {
  return String(text ?? '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.includes('\r') ? line.split('\r').filter((_, i, a) => i === a.length - 1 || a[i] !== '').pop() : line))
    .join('\n');
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

export function parseKeyValues(stdout) {
  const out = {};
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

export function parsePoll(stdout) {
  const kv = parseKeyValues(stdout);
  const state = kv.state || 'unknown';
  const exitText = (kv.exit ?? '').trim();
  return {
    state,
    exitCode: exitText === '' || Number.isNaN(Number(exitText)) ? null : Number(exitText),
    size: Number(kv.size) || 0,
    stopped: kv.stopped === '1',
    bytes: base64ToBytes(kv.body || ''),
  };
}

export function parseJobList(stdout) {
  return String(stdout || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const [id, state, exit, start, ...rest] = line.split('|');
    return { id, state, exitCode: exit === '' || exit === undefined ? null : Number(exit), startedAt: Number(start) ? Number(start) * 1000 : null, command: rest.join('|') };
  }).filter((j) => JOB_ID.test(j.id));
}

// ---------------------------------------------------------------------------------------------
// Minimal USTAR writer (tar is always present in Termux; unzip/python are not guaranteed).
// ---------------------------------------------------------------------------------------------

export const safeWorkspaceName = (name) => String(name || '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80);

const enc = new TextEncoder();
function octal(n, len) { return n.toString(8).padStart(len - 1, '0') + '\0'; }
function putStr(buf, off, str, len) { const b = enc.encode(str); if (b.length > len) throw new Error(`tar field too long: ${str}`); buf.set(b, off); }

export function safeTarPath(p) {
  const norm = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
  if (!norm || norm.startsWith('/') || norm.split('/').some((s) => s === '..' || s === '')) throw new Error(`Unsafe path in project: ${p}`);
  return norm;
}
function splitTarName(path) {
  if (enc.encode(path).length <= 100) return ['', path];
  for (let i = path.indexOf('/'); i !== -1; i = path.indexOf('/', i + 1)) {
    const prefix = path.slice(0, i), name = path.slice(i + 1);
    if (enc.encode(prefix).length <= 155 && enc.encode(name).length <= 100) return [prefix, name];
  }
  throw new Error(`Path too long to archive: ${path}`);
}

/** entries: [{ path, data: Uint8Array }] -> Uint8Array (uncompressed ustar archive) */
export function makeTar(entries, mtime = Math.floor(Date.now() / 1000)) {
  const blocks = [];
  for (const entry of entries) {
    const path = safeTarPath(entry.path);
    const data = entry.data instanceof Uint8Array ? entry.data : enc.encode(String(entry.data ?? ''));
    const [prefix, name] = splitTarName(path);
    const h = new Uint8Array(512);
    putStr(h, 0, name, 100); putStr(h, 100, octal(0o644, 8), 8); putStr(h, 108, octal(0, 8), 8); putStr(h, 116, octal(0, 8), 8);
    putStr(h, 124, octal(data.length, 12), 12); putStr(h, 136, octal(mtime, 12), 12);
    h.fill(0x20, 148, 156); h[156] = 0x30; putStr(h, 257, 'ustar\0', 6); putStr(h, 263, '00', 2); putStr(h, 345, prefix, 155);
    let sum = 0; for (let i = 0; i < 512; i++) sum += h[i];
    putStr(h, 148, sum.toString(8).padStart(6, '0') + '\0 ', 8);
    blocks.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const total = blocks.reduce((n, b) => n + b.length, 0), out = new Uint8Array(total);
  let off = 0; for (const b of blocks) { out.set(b, off); off += b.length; }
  return out;
}

/** Project file map ({path: string | {__wydevBinary, base64}}) -> tar entries. */
export function projectEntries(files) {
  const entries = [];
  for (const [path, value] of Object.entries(files || {})) {
    if (value && typeof value === 'object' && value.__wydevBinary) entries.push({ path, data: base64ToBytes(value.base64) });
    else if (typeof value === 'string') entries.push({ path, data: enc.encode(value) });
  }
  return entries;
}

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

const sleep = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener?.('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

const bashCall = (script, ...args) => ({ path: TERMUX_BASH, args: ['-c', script, 'pothub', ...args.map(String)] });

function explain(error) {
  const msg = String(error?.message || error || '');
  if (/not implemented|unimplemented/i.test(msg)) return new Error('This APK was built before Termux streaming support was added. Rebuild the APK, then run "npm run android:configure".');
  return error instanceof Error ? error : new Error(msg);
}

/**
 * @param {{ exec: (opts:{path:string,args:string[],cwd?:string,background?:boolean,timeoutMs?:number}) => Promise<{stdout?:string,stderr?:string,exitCode?:number,err?:number,errmsg?:string}> }} deps
 */
export function createTermuxClient({ exec }) {
  const call = async (spec, timeoutMs = 20000) => {
    let res;
    try { res = await exec({ ...spec, background: true, timeoutMs }); } catch (error) { throw explain(error); }
    if (res && Number(res.err) > 0 && res.errmsg) throw new Error(`Termux error: ${res.errmsg}`);
    return res || {};
  };

  async function probe() {
    const res = await call(bashCall(PROBE_SCRIPT), 15000);
    const kv = parseKeyValues(res.stdout);
    if (kv.pothub !== 'ok') throw new Error('Termux answered but did not run the check script. Make sure allow-external-apps=true is set in ~/.termux/termux.properties.');
    const tools = Object.fromEntries(Object.entries(kv).filter(([k]) => k.startsWith('tool.')).map(([k, v]) => [k.slice(5), v === '1']));
    return { ok: true, home: kv.home || TERMUX_HOME, prefix: kv.prefix || TERMUX_PREFIX, bash: kv.bash || '', tools };
  }

  async function poll(id, offset, max = POLL_CHUNK_BYTES) {
    const res = await call(bashCall(POLL_SCRIPT, assertJobId(id), offset, max), 20000);
    return parsePoll(res.stdout);
  }

  async function stop(id) {
    const res = await call(bashCall(STOP_SCRIPT, assertJobId(id)), 20000);
    return { stopped: /stopped=1/.test(String(res.stdout || '')) };
  }

  async function list() { return parseJobList((await call(bashCall(LIST_SCRIPT), 15000)).stdout); }
  async function cleanup(days = 3) { try { await call(bashCall(CLEAN_SCRIPT, days), 15000); } catch {} }

  /**
   * Stream an already-started (or running) job from `offset`. Resolves when the job is finished and drained.
   */
  async function follow(id, { offset = 0, onOutput, onState, signal, pollMs = 600, maxPollMs = 2000, startTimeoutMs = 30000, onStopped, awaitStart = false, failFast } = {}) {
    assertJobId(id);
    const decoder = new TextDecoder('utf-8');
    let pos = offset, retained = '', trimmed = false, last = 'starting', idle = 0, startedAt = Date.now(), abortSent = false, endedAt = 0, failures = 0;
    const emit = (text) => {
      if (!text) return;
      retained += text;
      if (retained.length > RETAINED_OUTPUT_CHARS) { retained = retained.slice(retained.length - RETAINED_OUTPUT_CHARS); trimmed = true; }
      onOutput?.(text);
    };
    const setState = (s) => { if (s !== last) { last = s; onState?.(s); } };
    while (true) {
      if (signal?.aborted && !abortSent) {
        abortSent = true;
        try { await stop(id); onStopped?.(); } catch {}
      }
      let r;
      try { r = await poll(id, pos); failures = 0; }
      catch (error) {
        if (++failures >= 4) throw error;
        await sleep(1000, undefined); continue;
      }
      if (r.bytes.length) { pos += r.bytes.length; emit(decoder.decode(r.bytes, { stream: true })); idle = 0; } else idle++;
      if (r.state === 'running') setState('running');
      if (r.state === 'missing' && awaitStart && pos === 0 && Date.now() - startedAt < startTimeoutMs) r = { ...r, state: 'starting' };
      if (r.state === 'missing') throw new Error('Termux has no record of this job (it may have been cleaned up).');
      if (r.state === 'starting') { const early = failFast?.(); if (early) throw early; }
      const drained = pos >= r.size;
      if ((r.state === 'exited' || r.state === 'lost') && drained) {
        emit(decoder.decode());
        const wasStopped = r.stopped || abortSent;
        const exitCode = r.state === 'exited' ? r.exitCode : (wasStopped ? 143 : null);
        const final = wasStopped ? 'stopped' : r.state === 'lost' ? 'lost' : exitCode === 0 ? 'succeeded' : 'failed';
        setState(final);
        endedAt = Date.now();
        return { jobId: id, state: final, exitCode, success: final === 'succeeded', stopped: wasStopped, lost: r.state === 'lost' && !wasStopped, output: retained, outputTrimmed: trimmed, bytes: pos, durationMs: endedAt - startedAt };
      }
      if (r.state === 'starting' && Date.now() - startedAt > startTimeoutMs) {
        throw new Error('Termux accepted the request but never started the job. Open Termux once, confirm allow-external-apps=true, and disable battery restrictions for Termux.');
      }
      if (!r.bytes.length || drained) await sleep(Math.min(maxPollMs, pollMs + idle * 150), signal);
    }
  }

  /** Start a command and stream it live. Resolves with the final result; rejects only on infrastructure failure. */
  async function run({ command, cwd = '', onOutput, onState, onStart, signal, pollMs, maxPollMs, startTimeoutMs } = {}) {
    const cmd = String(command ?? '');
    if (!cmd.trim()) throw new Error('Enter a command to run.');
    if (cmd.indexOf('\0') >= 0) throw new Error('The command contains an invalid character.');
    const id = newJobId();
    const startedAt = Date.now();
    onState?.('starting');
    let launch = cmd;
    const cmdBytes = enc.encode(cmd);
    if (cmdBytes.length > MAX_INLINE_COMMAND_BYTES) {
      // One argv entry is limited by the OS (128 KB). Ship large scripts as a file and run that instead.
      const uploadId = `up_${id.slice(3)}`;
      for (let offset = 0; offset < cmdBytes.length; offset += UPLOAD_CHUNK_BYTES) {
        const res = await call(bashCall(UPLOAD_CHUNK_SCRIPT, uploadId, bytesToBase64(cmdBytes.subarray(offset, offset + UPLOAD_CHUNK_BYTES)), 'cmd'), 30000);
        if (!/ok/.test(String(res.stdout || ''))) throw new Error('Termux could not store the command script.');
      }
      launch = `bash "$HOME/${UPLOADS_DIR}/${uploadId}.cmd"`;
    }
    // The runner call resolves only when the job ends; until then its only job is to report launch failures early.
    let runnerError = null;
    exec({ ...bashCall(RUNNER_SCRIPT, id, String(cwd || ''), launch), background: true, timeoutMs: 0 }).then(
      (res) => { if (res && Number(res.err) > 0 && res.errmsg) runnerError = new Error(`Termux error: ${res.errmsg}`); },
      (error) => { runnerError = explain(error); },
    );
    onStart?.(id);
    const result = await follow(id, { onOutput, onState, signal, pollMs, maxPollMs, startTimeoutMs, awaitStart: true, failFast: () => runnerError });
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  /** Upload a project file map into ~/.pothub/workspaces/<name> using one tar stream. */
  async function writeProject({ name, files, mirror = true, onProgress, signal } = {}) {
    const safeName = safeWorkspaceName(name);
    if (!safeName) throw new Error('A workspace name is required.');
    const entries = projectEntries(files);
    if (!entries.length) throw new Error('This project has no files to send.');
    const tar = makeTar(entries);
    const uploadId = `up_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const total = tar.length;
    for (let offset = 0; offset < total; offset += UPLOAD_CHUNK_BYTES) {
      if (signal?.aborted) throw new Error('Upload cancelled.');
      const chunk = tar.subarray(offset, Math.min(total, offset + UPLOAD_CHUNK_BYTES));
      const res = await call(bashCall(UPLOAD_CHUNK_SCRIPT, uploadId, bytesToBase64(chunk), 'tar'), 30000);
      if (!/ok/.test(String(res.stdout || ''))) throw new Error(`Termux could not store upload data${res.stderr ? `: ${String(res.stderr).trim().slice(0, 200)}` : '.'}`);
      onProgress?.({ sent: Math.min(total, offset + chunk.length), total, files: entries.length });
    }
    const res = await call(bashCall(EXTRACT_SCRIPT, uploadId, safeName, mirror ? '1' : '0'), 60000);
    const kv = parseKeyValues(res.stdout);
    if (!kv.workspace) throw new Error(`Termux could not unpack the project: ${String(res.stdout || res.stderr || 'unknown error').trim().slice(0, 240)}`);
    return { workspace: kv.workspace, files: entries.length, bytes: total };
  }

  return { probe, poll, follow, run, stop, list, cleanup, writeProject };
}
