/**
 * Pause/resume for agent jobs.
 *
 * A job (a request that carries an Idempotency-Key) is PAUSED, not failed, when
 *  - the device goes offline or the server cannot be reached, or
 *  - the free daily limit is reached (HTTP 429 daily_limit_reached).
 * It resumes by re-sending the SAME request with the SAME key, so the server treats it as one operation.
 *   offline -> resumes when the browser reports "online" and the API answers a health probe
 *   limit   -> resumes when the allowance resets, or immediately when the plan changes (event "pothub:plan-changed")
 * Real HTTP errors (400/401/403/5xx) are never paused. Pausing is only for requests the caller marks resumable.
 */
const pending = new Map();
let counter = 0;
const listeners = new Set();
let snapshot = { active: false, kind: null, resetsAt: 0, since: 0, count: 0 };

function publish() {
  const jobs = [...pending.values()];
  if (!jobs.length) snapshot = { active: false, kind: null, resetsAt: 0, since: 0, count: 0 };
  else {
    const limits = jobs.filter((j) => j.kind === 'limit');
    snapshot = {
      active: true,
      kind: limits.length ? 'limit' : 'offline',
      resetsAt: limits.length ? Math.min(...limits.map((j) => j.resetsAt || Infinity)) : 0,
      since: Math.min(...jobs.map((j) => j.since)),
      count: jobs.length,
    };
  }
  for (const fn of listeners) { try { fn(snapshot); } catch { /* a bad subscriber must not break a job */ } }
}

export const getPauseState = () => snapshot;
export function subscribePause(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Decide whether an error should pause the job. Returns 'limit', 'offline' or null (do not pause). */
export function pauseKindFor(error, { signal, online = () => typeof navigator === 'undefined' || navigator.onLine !== false } = {}) {
  if (!error || signal?.aborted) return null;
  if (error.code === 'daily_limit_reached') return 'limit';
  if (error.status) return null;
  // A timeout is only "offline" when the browser agrees; otherwise it is a real failure the user should see.
  if (error.name === 'AbortError' || error.code === 'TIMEOUT') return online() ? null : 'offline';
  // Only genuine connectivity failures pause. Server-side stream errors and parse errors must surface, not loop.
  if (error.code === 'NETWORK' || error instanceof TypeError) return 'offline';
  return null;
}

export function waitForResume(kind, {
  signal, resetsAt = 0, probe, maxOfflineMs = 30 * 60 * 1000, pollMs = 4000,
  now = Date.now, setT = setTimeout, clearT = clearTimeout, target = typeof window !== 'undefined' ? window : undefined,
} = {}) {
  return new Promise((resolve, reject) => {
    const id = ++counter, since = now(), timers = new Set();
    pending.set(id, { kind, resetsAt, since });
    publish();
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      timers.forEach((t) => clearT(t));
      target?.removeEventListener?.('online', onOnline);
      target?.removeEventListener?.('pothub:plan-changed', onPlan);
      signal?.removeEventListener?.('abort', onAbort);
      pending.delete(id);
      publish();
      fn(value);
    };
    const later = (fn, ms) => { const t = setT(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    const onOnline = () => { if (kind === 'offline') tick(); };
    const onPlan = () => { if (kind === 'limit') finish(resolve); };
    const onAbort = () => finish(reject, Object.assign(new Error('The paused job was cancelled.'), { name: 'AbortError', code: 'CANCELLED' }));
    async function tick() {
      if (done) return;
      if (now() - since > maxOfflineMs) return finish(reject, Object.assign(new Error('Still unable to reach PotHub after 30 minutes. Check your connection and retry.'), { code: 'NETWORK' }));
      try { if (!probe || await probe()) return finish(resolve); } catch { /* still offline */ }
      later(tick, pollMs);
    }
    target?.addEventListener?.('online', onOnline);
    target?.addEventListener?.('pothub:plan-changed', onPlan);
    if (signal?.aborted) return onAbort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    if (kind === 'limit') later(() => finish(resolve), Math.max(1000, Math.min(Number(resetsAt) - now() + 1500, 2 ** 31 - 1)));
    else later(tick, pollMs);
  });
}
