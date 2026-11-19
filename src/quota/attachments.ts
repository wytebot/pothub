import { useEffect, useState } from 'react';
import { isPremium } from './daily';

/** Free plan: 10 uploaded/selected attachments per rolling usage window; all 10 return 5 hours after the first is consumed. Premium is unlimited. This quota is separate from extraction/chunking limits. */
export const ATTACH_LIMIT = 10;
export const ATTACH_WINDOW_MS = 5 * 3_600_000;
const KEY = 'attach.window.v1';
export const ATTACH_CHANGED = 'attach:changed';

interface Win { start: number; ids: string[]; }
export interface AttachStatus { unlimited: boolean; limit: number; used: number; left: number; /** when the free attachments come back (ms), or null while none are used */ resetsAt: number | null; }

function read(now: number): Win | null {
  try {
    const w = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Win | null;
    if (!w || !Array.isArray(w.ids) || typeof w.start !== 'number') return null;
    if (now - w.start >= ATTACH_WINDOW_MS) { localStorage.removeItem(KEY); return null; }
    if (w.start > now + 60_000) return { ...w, start: now }; // the device clock was moved back: do not let that shorten the wait
    return w;
  } catch { return null; }
}

export function attachStatus(now = Date.now()): AttachStatus {
  if (isPremium()) return { unlimited: true, limit: Infinity, used: 0, left: Infinity, resetsAt: null };
  const w = read(now); const used = w?.ids.length ?? 0;
  return { unlimited: false, limit: ATTACH_LIMIT, used, left: Math.max(0, ATTACH_LIMIT - used), resetsAt: w ? w.start + ATTACH_WINDOW_MS : null };
}

/** True when this attachment was already paid for in the current window (editing or resending a message must not charge twice). */
export const isCounted = (id: string, now = Date.now()) => !!read(now)?.ids.includes(id);

/** How many of these files would use up a fresh attachment. */
export const costOf = (ids: string[], now = Date.now()) => { const w = read(now); return ids.filter((i) => !w?.ids.includes(i)).length; };

/** Uses up attachments for a message that is being sent. Returns false (and uses nothing) if there is not enough left. */
export function consume(ids: string[], now = Date.now()): boolean {
  if (isPremium()) return true;
  const w = read(now); const fresh = ids.filter((i) => !w?.ids.includes(i));
  if (!fresh.length) return true;
  if ((w?.ids.length ?? 0) + fresh.length > ATTACH_LIMIT) return false;
  try { localStorage.setItem(KEY, JSON.stringify({ start: w?.start ?? now, ids: [...(w?.ids ?? []), ...fresh] })); } catch { /* storage blocked: the limit simply is not remembered */ }
  window.dispatchEvent(new Event(ATTACH_CHANGED));
  return true;
}

/** "9:42 PM", or "tomorrow 1:10 AM" when it is not today. */
export function clockLabel(ms: number, now = Date.now()): string {
  const d = new Date(ms); const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date(now).toDateString()) return t;
  const next = new Date(now); next.setDate(next.getDate() + 1);
  return d.toDateString() === next.toDateString() ? `tomorrow ${t}` : `${d.toLocaleDateString([], { weekday: 'short' })} ${t}`;
}
/** "3 h 12 min", "42 min" or "under a minute". */
export function waitLabel(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000)); if (m < 1) return 'under a minute';
  const h = Math.floor(m / 60); return h ? `${h} h ${m % 60} min` : `${m} min`;
}

/** Live status for screens: refreshes when attachments are used, when premium changes, and every 20 seconds so countdowns stay true. */
export function useAttachStatus(): AttachStatus {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1); const t = setInterval(f, 20_000);
    for (const e of [ATTACH_CHANGED, 'billing:licensed', 'account:server-sync']) window.addEventListener(e, f);
    return () => { clearInterval(t); for (const e of [ATTACH_CHANGED, 'billing:licensed', 'account:server-sync']) window.removeEventListener(e, f); };
  }, []);
  return attachStatus();
}
