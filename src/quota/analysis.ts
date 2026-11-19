import { useEffect, useState } from 'react';
import { isPremium } from './daily';

/** File analysis: one analysis is charged when a request actually reads one or more source files (user-attached or generated files supplied as inputs). Free: 10 analyses per 5-hour window; Premium: unlimited. This quota is separate from extraction/chunking limits. */
export const ANALYSIS_LIMIT = 10;
export const ANALYSIS_WINDOW_MS = 5 * 3_600_000;
const KEY = 'analysis.window.v1';
export const ANALYSIS_CHANGED = 'analysis:changed';

interface Win { start: number; used: number; }

function read(now: number): Win | null {
  try {
    const w = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Win | null;
    if (!w || typeof w.start !== 'number' || typeof w.used !== 'number') return null;
    if (now - w.start >= ANALYSIS_WINDOW_MS) { localStorage.removeItem(KEY); return null; }
    if (w.start > now + 60_000) return { ...w, start: now }; // the clock was moved back: do not shorten the wait
    return w;
  } catch { return null; }
}

export interface AnalysisStatus { unlimited: boolean; limit: number; used: number; left: number; /** when the free ones come back (ms), or null while none are used */ resetsAt: number | null; }
export function analysisStatus(now = Date.now()): AnalysisStatus {
  if (isPremium()) return { unlimited: true, limit: Infinity, used: 0, left: Infinity, resetsAt: null };
  const w = read(now); const used = w?.used ?? 0;
  return { unlimited: false, limit: ANALYSIS_LIMIT, used, left: Math.max(0, ANALYSIS_LIMIT - used), resetsAt: w ? w.start + ANALYSIS_WINDOW_MS : null };
}

/** Counts one completed file-analysis request, regardless of how many source files it included. Call only after files were actually read and answered. The 5-hour window starts with the first completed analysis. */
export function consumeAnalysis(now = Date.now()) {
  if (isPremium()) return;
  const w = read(now);
  try { localStorage.setItem(KEY, JSON.stringify({ start: w?.start ?? now, used: (w?.used ?? 0) + 1 })); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(ANALYSIS_CHANGED));
}

/** Live status for screens: refreshes after each analysis, when premium changes, and every 20 seconds so the countdown stays true. */
export function useAnalysisStatus(): AnalysisStatus {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1); const t = setInterval(f, 20_000); const ev = [ANALYSIS_CHANGED, 'billing:licensed', 'account:server-sync'];
    for (const e of ev) window.addEventListener(e, f);
    return () => { clearInterval(t); for (const e of ev) window.removeEventListener(e, f); };
  }, []);
  return analysisStatus();
}
