import { putMedia, uid } from '../storage/db';
import { getSecret, listKeys, usableKey, type ProviderId } from '../vault/vault';
import { downloadVideo, pollVideo } from '../models/video';
import { logFor } from './log';
import { notifyDone } from '../notify';

export interface Job { id: string; provider?: ProviderId; /** the key that started the job, so polling keeps using it even if its default tick changes */ keyId?: string; model: string; op: string; prompt: string; aspect: string; createdAt: number; status: 'running' | 'done' | 'failed' | 'cancelled'; error?: string; mediaId?: string; }
const JOBS = 'video.jobs'; const TIMEOUT = 15 * 60_000;
export const readJobs = (): Job[] => { try { return JSON.parse(localStorage.getItem(JOBS) ?? '[]'); } catch { return []; } };
export const saveJobs = (next: Job[]) => { localStorage.setItem(JOBS, JSON.stringify(next)); window.dispatchEvent(new Event('jobs:changed')); };
export const patchJob = (id: string, p: Partial<Job>) => saveJobs(readJobs().map((j) => (j.id === id ? { ...j, ...p } : j)));
export const addJob = (j: Job) => saveJobs([j, ...readJobs()]);
const brief = (s: string) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > 60 ? `${t.slice(0, 59)}…` : t; };
const videoFailed = (j: Job, why: string) => void notifyDone({ kind: 'video', title: 'Your video could not be finished', body: `“${brief(j.prompt)}”: ${why}`, route: '/video' });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';

const polling = new Set<string>(); const polls = new Map<string, { line: number; n: number }>();

/** One pass over every running video job. Safe to call from more than one page: a job is only worked on by one caller at a time. */
export async function pollJobs(): Promise<boolean> {
  let saved = false;
  for (const j of readJobs().filter((x) => x.status === 'running')) {
    if (polling.has(j.id)) continue;
    if (Date.now() - j.createdAt > TIMEOUT) { patchJob(j.id, { status: 'failed', error: 'Timed out after 15 minutes. Check your provider dashboard; you may still be billed.' }); videoFailed(j, 'timed out after 15 minutes.'); continue; }
    polling.add(j.id);
    const provider: ProviderId = j.provider ?? 'gemini';
    try {
      const key = (j.keyId ? listKeys().find((k) => k.id === j.keyId) : undefined) ?? usableKey(provider, 'video'); if (!key) throw new Error('The key used for this job was removed.');
      const secret = await getSecret(key.id);
      const lg = logFor(j.id); const ps = polls.get(j.id) ?? { line: lg.start('cmd', `operations.get ${j.op.split('/').pop()?.slice(0, 12) ?? ''}`), n: 0 }; polls.set(j.id, ps);
      lg.step('Your video is rendering. This can take a few minutes…');
      const r = await pollVideo(provider, secret, j.op); ps.n++;
      if (r.state === 'running') lg.update(ps.line, { detail: `poll #${ps.n} · provider is still rendering` });
      if (r.state === 'failed') { lg.fail(ps.line, r.message); patchJob(j.id, { status: 'failed', error: r.message }); videoFailed(j, r.message); }
      else if (r.state === 'done') {
        lg.done(ps.line, `ready after ${ps.n} poll${ps.n > 1 ? 's' : ''}`); lg.step('Almost there, downloading your video…'); const dl = lg.start('cmd', 'download --retry 3');
        const blob = await downloadVideo(provider, secret, r.uri);
        if (blob.size <= 0) throw new Error('The provider returned an empty video file. It was not added to your library.');
        lg.step('Checking the downloaded video…');
        lg.done(dl, `${(blob.size / 1_048_576).toFixed(1)} MB`);
        const mediaId = uid();
        await putMedia({ id: mediaId, projectId: null, kind: 'video', name: `${slug(j.prompt)}.mp4`, mime: blob.type || 'video/mp4', size: blob.size, createdAt: Date.now(), blob });
        lg.step('Saving it to your library…'); const sv = lg.start('cmd', 'library.save'); lg.done(sv, 'saved on this device'); lg.say('ok', 'done');
        patchJob(j.id, { status: 'done', mediaId }); saved = true; window.dispatchEvent(new Event('library:changed'));
        void notifyDone({ kind: 'video', title: 'Your video is ready', body: `“${brief(j.prompt)}” is saved in your library.`, route: '/video' });
      }
    } catch (e) { /* transient errors: keep polling until timeout */ if (e instanceof Error && /removed|no longer stored|empty video file/.test(e.message)) { patchJob(j.id, { status: 'failed', error: e.message }); videoFailed(j, e.message); } }
    finally { polling.delete(j.id); }
  }
  return saved;
}

/** Calls pollJobs now and every few seconds until stopped. */
export function startJobPoller(everyMs = 8000): () => void {
  let stop = false; const tick = () => { if (!stop) void pollJobs(); };
  const resume = () => { if (document.visibilityState === 'visible') tick(); };
  tick(); const t = setInterval(tick, everyMs); document.addEventListener('visibilitychange', resume);
  return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', resume); };
}
