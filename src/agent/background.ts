import { request } from '../security/api';
import { perr } from '../models/http';
import { textOf, type Attachment } from './attachments';
import { unreadable, type TextRequest, type TextResult } from '../models/text';
import type { ProviderId } from '../vault/vault';
import type { Wanted } from './deliver';
import type { WebSource } from './research';

/**
 * Background jobs: the answer is written by the MonyGist server, so it finishes even if the person closes the app,
 * switches apps or loses signal. The app follows the job while it is open and picks the result up again on return.
 * The provider key goes to the server for this one run only (held in memory, never stored or logged).
 */
const PREF = 'jobs.background';
const PENDING = 'jobs.pending.v1';
const API = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

export const backgroundAvailable = (): boolean => !!API;
export const backgroundOn = (): boolean => { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } };
export const setBackground = (on: boolean) => { try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* storage blocked */ } };

export interface PendingJob { id: string; chatId: string; msgId: string; prompt: string; wanted: Wanted; modelName: string; notes: string[]; sources?: WebSource[]; started: number; }
const readPending = (): PendingJob[] => { try { const rows = JSON.parse(localStorage.getItem(PENDING) ?? '[]') as PendingJob[]; return rows.filter((r) => Date.now() - r.started < 29 * 24 * 3_600_000); } catch { return []; } };
const writePending = (rows: PendingJob[]) => { try { localStorage.setItem(PENDING, JSON.stringify(rows)); } catch { /* storage blocked */ } };
export const pendingJobs = (): PendingJob[] => readPending();
export const pendingFor = (msgId: string): PendingJob | undefined => readPending().find((p) => p.msgId === msgId);
export const addPending = (p: PendingJob) => writePending([...readPending().filter((x) => x.msgId !== p.msgId), p]);
export const dropPending = (msgId: string) => writePending(readPending().filter((x) => x.msgId !== msgId));

/** Raised only when a job could not be handed to the server at all, so the caller can run it on this device instead. */
export class NotStarted extends Error {}
/** The person left this chat but the job should carry on: stop following without cancelling it. */
export const DETACH = 'switch';

interface View { status: 'running' | 'done' | 'error' | 'cancelled'; length: number; chunk: string; error?: string; httpStatus?: number; truncated?: boolean; }
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => { const t = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true }); });
export const cancelRemote = (id: string) => { void request('/api/jobs/cancel', { id }, 10_000).catch(() => { /* already finished */ }); };

/** Follows a job until it ends. Network drops never end it: polling simply carries on when the connection is back. */
export async function follow(id: string, o: { signal?: AbortSignal; onText?: (soFar: string) => void; from?: string } = {}): Promise<{ text: string; truncated: boolean }> {
  let text = ''; let failures = 0; const { signal } = o;
  for (;;) {
    if (signal?.aborted) { if (signal.reason !== DETACH) cancelRemote(id); throw new Error('Cancelled.'); }
    let v: View | null = null;
    try { v = await request<View>(`/api/jobs/status?id=${encodeURIComponent(id)}&from=${text.length}`, undefined, 20_000); }
    catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (/no longer available/i.test(m)) throw new Error(`This job is no longer available (job ${id}). Send it again.`);
      if (/session has expired|sign in|unauthori[sz]ed|\b401\b|\b403\b/i.test(m)) throw new Error(`Sign-in is required to resume job ${id}. Sign in again, then resume the job.`);
      failures += 1; if (failures >= 8) throw new Error(`Could not reach the job server after repeated attempts. Job ${id} is retained and can be resumed later.`);
      await sleep(Math.min(30_000, 1200 * 2 ** Math.min(failures, 5)), signal); continue;
    }
    failures = 0;
    if (v) {
      if (v.chunk) { text += v.chunk; o.onText?.(text); }
      if (v.status === 'done') return { text: text.trim(), truncated: !!v.truncated };
      if (v.status === 'error') throw perr(v.error ?? 'The job failed. Try again.', v.httpStatus);
      if (v.status === 'cancelled') throw new Error('Cancelled.');
    }
    await sleep(document.visibilityState === 'visible' ? 1200 : 5000, signal);
  }
}

/** Runs one text request on the server and follows it. Same result shape as generateText. */
export async function generateInBackground(provider: ProviderId, secret: string, r: TextRequest, ctx: { msgId?: string; onStarted?: (id: string) => void; mode?: 'text' | 'agent' } = {}): Promise<TextResult> {
  const skip = unreadable(provider, r.files); let blocks = '';
  for (const f of r.files as Attachment[]) { if (skip.includes(f)) continue; if (f.kind === 'text' || f.kind === 'docx') blocks += `File: ${f.name}\n\`\`\`\n${await textOf(f)}\n\`\`\`\n\n`; }
  let id: string;
  try { id = (await request<{ id: string }>('/api/jobs', { provider, model: r.model, secret, system: r.system, history: r.history, prompt: `${blocks}${r.prompt}`, maxTokens: r.maxTokens, mode: ctx.mode ?? 'text' }, 60_000)).id; }
  catch (e) { throw new NotStarted(e instanceof Error ? e.message : 'Could not start a background job.'); }
  ctx.onStarted?.(id);
  try {
    const out = await follow(id, { signal: r.signal, onText: r.onText });
    if (ctx.msgId) dropPending(ctx.msgId);
    return { text: out.text, truncated: out.truncated, unread: skip.map((f) => f.name) };
  } catch (e) { if (r.signal?.reason !== DETACH && ctx.msgId) dropPending(ctx.msgId); throw e; }
}
