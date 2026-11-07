import test from 'node:test';
import assert from 'node:assert/strict';
import { pauseKindFor, waitForResume, getPauseState, subscribePause } from '../src/lib/job-pause.js';

// Deterministic clock/timers so no test waits in real time.
function clock() {
  let t = 1_000_000, id = 0; const q = new Map();
  return {
    now: () => t, setT: (fn, ms) => { q.set(++id, { fn, at: t + ms }); return id; }, clearT: (i) => q.delete(i),
    async advance(ms) { const end = t + ms; for (;;) { const next = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; t = next[1].at; q.delete(next[0]); next[1].fn(); await Promise.resolve(); await Promise.resolve(); } t = end; },
  };
}

test('only the right errors pause a job', () => {
  assert.equal(pauseKindFor({ code: 'daily_limit_reached', status: 429 }), 'limit');
  assert.equal(pauseKindFor(new TypeError('Failed to fetch')), 'offline');
  assert.equal(pauseKindFor({ status: 500 }), null);
  assert.equal(pauseKindFor({ status: 401 }), null);
  assert.equal(pauseKindFor({ status: 429, code: 'HTTP_429' }), null, 'ordinary rate limiting is not the daily limit');
  assert.equal(pauseKindFor({ name: 'AbortError' }, { online: () => true }), null, 'a plain timeout while online is a failure');
  assert.equal(pauseKindFor({ name: 'AbortError' }, { online: () => false }), 'offline');
  assert.equal(pauseKindFor({ code: 'NETWORK' }), 'offline');
  assert.equal(pauseKindFor({ code: 'TIMEOUT' }, { online: () => true }), null);
  assert.equal(pauseKindFor({ code: 'AGENT_STREAM_FAILED' }), null, 'a server-side stream error must surface, not loop forever');
  assert.equal(pauseKindFor(new Error('The agent stream ended before completion.')), null);
  assert.equal(pauseKindFor(new TypeError('x'), { signal: { aborted: true } }), null, 'a cancelled job never pauses');
});

test('offline: resumes only once the probe succeeds, and reports state while waiting', async () => {
  const c = clock(), target = new EventTarget(); let up = false, seen = [];
  const unsub = subscribePause((s) => seen.push(s.active ? s.kind : 'idle'));
  const p = waitForResume('offline', { ...c, target, probe: async () => up });
  assert.equal(getPauseState().kind, 'offline');
  await c.advance(8000); assert.equal(getPauseState().active, true, 'still paused while the probe fails');
  up = true; target.dispatchEvent(new Event('online'));
  await p; assert.equal(getPauseState().active, false);
  assert.deepEqual([seen[0], seen.at(-1)], ['offline', 'idle']); unsub();
});

test('offline: gives up with a NETWORK error after the maximum wait', async () => {
  const c = clock(); const p = waitForResume('offline', { ...c, target: new EventTarget(), probe: async () => false, maxOfflineMs: 20000 });
  const settled = p.then(() => 'resumed', (e) => e.code); await c.advance(30000);
  assert.equal(await settled, 'NETWORK'); assert.equal(getPauseState().active, false);
});

test('limit: resumes when the allowance resets', async () => {
  const c = clock(); const resetsAt = c.now() + 60000; let resumed = false;
  const p = waitForResume('limit', { ...c, target: new EventTarget(), resetsAt }).then(() => { resumed = true; });
  assert.equal(getPauseState().kind, 'limit'); assert.equal(getPauseState().resetsAt, resetsAt);
  await c.advance(30000); assert.equal(resumed, false);
  await c.advance(35000); await p; assert.equal(resumed, true);
});

test('limit: upgrading resumes immediately; going online does not', async () => {
  const c = clock(), target = new EventTarget(); let resumed = false;
  const p = waitForResume('limit', { ...c, target, resetsAt: c.now() + 3600000 }).then(() => { resumed = true; });
  target.dispatchEvent(new Event('online')); await Promise.resolve(); assert.equal(resumed, false);
  target.dispatchEvent(new Event('pothub:plan-changed')); await p; assert.equal(resumed, true);
});

test('cancelling a paused job rejects it and clears the banner state', async () => {
  const c = clock(), ac = new AbortController();
  const p = waitForResume('offline', { ...c, target: new EventTarget(), signal: ac.signal, probe: async () => false });
  ac.abort(); await assert.rejects(p, (e) => e.code === 'CANCELLED' && e.name === 'AbortError'); assert.equal(getPauseState().active, false);
});

test('several paused jobs share one banner state and clear independently', async () => {
  const c = clock(), t1 = new EventTarget(), t2 = new EventTarget();
  const a = waitForResume('offline', { ...c, target: t1, probe: async () => true });
  const b = waitForResume('limit', { ...c, target: t2, resetsAt: c.now() + 5000 });
  assert.equal(getPauseState().count, 2); assert.equal(getPauseState().kind, 'limit');
  t1.dispatchEvent(new Event('online')); await a; assert.equal(getPauseState().count, 1);
  await c.advance(10000); await b; assert.equal(getPauseState().active, false);
});
