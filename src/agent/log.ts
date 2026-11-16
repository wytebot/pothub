import { useSyncExternalStore } from 'react';

export type LineKind = 'cmd' | 'info' | 'ok' | 'warn' | 'err';
export interface Line { id: number; kind: LineKind; text: string; detail?: string; state: 'running' | 'done' | 'failed'; t0: number; t1?: number; }

/** A tiny observable list of workflow steps. Lines appear the moment they start, so the user sees progress immediately. */
export class RunLog {
  private snap: readonly Line[] = []; private subs = new Set<() => void>(); private seq = 0;
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getSnapshot = () => this.snap;
  private set(next: readonly Line[]) { this.snap = next; this.subs.forEach((f) => f()); }
  private patch(id: number, p: Partial<Line>) { this.set(this.snap.map((l) => (l.id === id ? { ...l, ...p } : l))); }
  /** Starts a step that is still running (spinner + live timer). */
  start(kind: LineKind, text: string, detail?: string): number { const id = ++this.seq; this.set([...this.snap, { id, kind, text, detail, state: 'running', t0: Date.now() }]); return id; }
  /** A step that is already finished (instant output). */
  say(kind: LineKind, text: string, detail?: string): number { const id = ++this.seq; const t = Date.now(); this.set([...this.snap, { id, kind, text, detail, state: kind === 'err' ? 'failed' : 'done', t0: t, t1: t }]); return id; }
  update(id: number, p: { text?: string; detail?: string }) { this.patch(id, p); }
  done(id: number, detail?: string) { this.patch(id, { state: 'done', t1: Date.now(), ...(detail !== undefined ? { detail } : {}) }); }
  fail(id: number, detail?: string) { this.patch(id, { state: 'failed', t1: Date.now(), ...(detail !== undefined ? { detail } : {}) }); }
  /** Anything still spinning is stopped (used on cancel / error so nothing looks stuck). */
  settle(state: 'done' | 'failed' = 'failed') { const t = Date.now(); this.set(this.snap.map((l) => (l.state === 'running' ? { ...l, state, t1: t } : l))); }
  clear() { this.set([]); }
}

const EMPTY = new RunLog();
export const useRunLog = (log: RunLog | null | undefined): readonly Line[] => { const l = log ?? EMPTY; return useSyncExternalStore(l.subscribe, l.getSnapshot, l.getSnapshot); };

/** Logs that outlive a page (one per background video job). */
const jobLogs = new Map<string, RunLog>();
export const logFor = (id: string): RunLog => { let l = jobLogs.get(id); if (!l) { l = new RunLog(); jobLogs.set(id, l); } return l; };
export const dropLog = (id: string) => void jobLogs.delete(id);
