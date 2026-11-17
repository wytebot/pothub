import { putMedia, uid } from '../storage/db';
import { record } from '../quota/daily';
import { getSecret, listKeys, usableKey, type ProviderId } from '../vault/vault';
import { downloadVideo, pollVideo } from '../models/video';
import { logFor } from './log';

export interface Job { id: string; provider?: ProviderId; /** the key that started the job, so polling keeps using it even if its default tick changes */ keyId?: string; model: string; op: string; prompt: string; aspect: string; createdAt: number; status: 'running' | 'done' | 'failed' | 'cancelled'; error?: string; mediaId?: string; }
const JOBS = 'video.jobs'; const TIMEOUT = 15 * 60_000;
export const readJobs = (): Job[] => { try { return JSON.parse(localStorage.getItem(JOBS) ?? '[]'); } catch { return []; } };
export const saveJobs = (next: Job[]) => { localStorage.setItem(JOBS, JSON.stringify(next)); window.dispatchEvent(new Event('jobs:changed')); };
export const patchJob = (id: string, p: Partial<Job>) => saveJobs(readJobs().map((j) => (j.id === id ? { ...j, ...p } : j)));
export const addJob = (j: Job) => saveJobs([j, ...readJobs()]);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';

const polling = new Set<string>(); const polls = new Map<string, { line: number; n: number }>();

/** One pass over every running video job. Safe to call from more than one page: a job is only worked on by one caller at a time. */
export async function pollJobs(): Promise<boolean> {
  let saved = false;
  for (const j of readJobs().filter((x) => x.status === 'running')) {
    if (polling.has(j.id)) continue;
    if (Date.now() - j.createdAt > TIMEOUT) { patchJob(j.id, { status: 'failed', error: 'Timed out after 15 minutes. Check your provider dashboard; you may still be billed.' }); continue; }
    polling.add(j.id);
    const provider: ProviderId = j.provider ?? 'gemini';
    try {
      const key = (j.keyId ? listKeys().find((k) => k.id === j.keyId) : undefined) ?? usableKey(provider, 'video'); if (!key) throw new Error('The key used for this job was removed.');
      const secret = await getSecret(key.id);
      const lg = logFor(j.id); const ps = polls.get(j.id) ?? { line: lg.start('cmd', `operations.get ${j.op.split('/').pop()?.slice(0, 12) ?? ''}`), n: 0 }; polls.set(j.id, ps);
      const r = await pollVideo(provider, secret, j.op); ps.n++;
      if (r.state === 'running') lg.update(ps.line, { detail: `poll #${ps.n} · provider is still rendering` });
      if (r.state === 'failed') { lg.fail(ps.line, r.message); patchJob(j.id, { status: 'failed', error: r.message }); }
      else if (r.state === 'done') {
        lg.done(ps.line, `ready after ${ps.n} poll${ps.n > 1 ? 's' : ''}`); const dl = lg.start('cmd', 'download --retry 3');
        const blob = await downloadVideo(provider, secret, r.uri); lg.done(dl, `${(blob.size / 1_048_576).toFixed(1)} MB`);
        const mediaId = uid();
        await putMedia({ id: mediaId, projectId: null, kind: 'video', name: `${slug(j.prompt)}.mp4`, mime: blob.type || 'video/mp4', size: blob.size, createdAt: Date.now(), blob });
        const sv = lg.start('cmd', 'library.save'); lg.done(sv, 'saved on this device'); lg.say('ok', 'done');
        record('video', 1); patchJob(j.id, { status: 'done', mediaId }); saved = true; window.dispatchEvent(new Event('library:changed'));
      }
    } catch (e) { /* transient errors: keep polling until timeout */ if (e instanceof Error && /removed|no longer stored/.test(e.message)) patchJob(j.id, { status: 'failed', error: e.message }); }
    finally { polling.delete(j.id); }
  }
  return saved;
}

/** Calls pollJobs now and every few seconds until stopped. */
export function startJobPoller(everyMs = 8000): () => void {
  let stop = false; const tick = () => { if (!stop) void pollJobs(); };
  tick(); const t = setInterval(tick, everyMs);
  return () => { stop = true; clearInterval(t); };
}
