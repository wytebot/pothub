import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteMedia, listLibrary, putMedia, uid, type MediaRecord } from '../storage/db';
import { getSecret, listKeys, usableKey } from '../vault/vault';
import { cachedCatalog, refreshCatalog } from '../agent/detect';
import { RunLog, logFor } from '../agent/log';
import { runInfo, runVideoStart } from '../agent/workflow';
import { COMMAND_HELP } from '../agent/commands';
import { Terminal } from '../ui/Terminal';
import { downloadVideo, pollVideo, startVideo } from '../models/video';
import { FREE_LIMITS, isPremium, record, remaining, usage } from '../quota/daily';
import { platform } from '../platform';
import { getSettings } from '../settings';
import { Select } from '../ui/Select';

interface Job { id: string; model: string; op: string; prompt: string; aspect: string; createdAt: number; status: 'running' | 'done' | 'failed' | 'cancelled'; error?: string; }
const JOBS = 'video.jobs'; const TIMEOUT = 15 * 60_000;
const readJobs = (): Job[] => { try { return JSON.parse(localStorage.getItem(JOBS) ?? '[]'); } catch { return []; } };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';

export function VideoStudio() {
  const [prompt, setPrompt] = useState(() => sessionStorage.getItem('studio.prompt') ?? '');
  const [catalog, setCatalog] = useState(cachedCatalog);
  const [active, setActive] = useState<string | null>(null);
  const startLog = useRef(new RunLog()).current; const [busy, setBusy] = useState(false); const abort = useRef<AbortController | null>(null);
  const [model, setModel] = useState(getSettings().videoModel);
  const [jobs, setJobs] = useState<Job[]>(readJobs());
  const [items, setItems] = useState<{ rec: MediaRecord; url: string }[]>([]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [used, setUsed] = useState(usage().video);
  const urls = useRef<string[]>([]); const polling = useRef(new Set<string>()); const polls = useRef(new Map<string, { line: number; n: number }>());
  const hasKey = listKeys().some((k) => k.provider === 'gemini' && k.status !== 'invalid');
  const m = catalog.video.find((x) => x.id === model);
  useEffect(() => { sessionStorage.removeItem('studio.prompt'); setCatalog(cachedCatalog()); if (hasKey) void refreshCatalog().then(setCatalog); }, [hasKey]);

  const save = (next: Job[]) => { localStorage.setItem(JOBS, JSON.stringify(next)); setJobs(next); };
  const patch = (id: string, p: Partial<Job>) => save(readJobs().map((j) => (j.id === id ? { ...j, ...p } : j)));
  const load = useCallback(async () => {
    const recs = (await listLibrary()).filter((r) => r.kind === 'video');
    urls.current.forEach(URL.revokeObjectURL);
    const next = recs.map((rec) => ({ rec, url: URL.createObjectURL(rec.blob) })); urls.current = next.map((n) => n.url); setItems(next);
  }, []);
  useEffect(() => { void load(); return () => urls.current.forEach(URL.revokeObjectURL); }, [load]);

  // Poll running jobs; survives refreshes because jobs live in localStorage (no secrets).
  useEffect(() => {
    const tick = async () => {
      for (const j of readJobs().filter((x) => x.status === 'running')) {
        if (polling.current.has(j.id)) continue;
        if (Date.now() - j.createdAt > TIMEOUT) { patch(j.id, { status: 'failed', error: 'Timed out after 15 minutes. Check your provider dashboard; you may still be billed.' }); continue; }
        polling.current.add(j.id);
        try {
          const key = usableKey('gemini'); if (!key) throw new Error('The key used for this job was removed.');
          const secret = await getSecret(key.id);
          const lg = logFor(j.id); const ps = polls.current.get(j.id) ?? { line: lg.start('cmd', `operations.get ${j.op.split('/').pop()?.slice(0, 12) ?? ''}`), n: 0 }; polls.current.set(j.id, ps);
          const r = await pollVideo(secret, j.op); ps.n++;
          if (r.state === 'running') lg.update(ps.line, { detail: `poll #${ps.n} · provider is still rendering` });
          if (r.state === 'failed') { lg.fail(ps.line, r.message); patch(j.id, { status: 'failed', error: r.message }); }
          else if (r.state === 'done') {
            lg.done(ps.line, `ready after ${ps.n} poll${ps.n > 1 ? 's' : ''}`); const dl = lg.start('cmd', 'download --retry 3');
            const blob = await downloadVideo(secret, r.uri); lg.done(dl, `${(blob.size / 1_048_576).toFixed(1)} MB`);
            await putMedia({ id: uid(), projectId: null, kind: 'video', name: `${slug(j.prompt)}.mp4`, mime: blob.type || 'video/mp4', size: blob.size, createdAt: Date.now(), blob });
            const sv = lg.start('cmd', 'library.save'); lg.done(sv, 'saved on this device'); lg.say('ok', 'done');
            record('video', 1); setUsed(usage().video); patch(j.id, { status: 'done' }); await load();
          }
        } catch (e) { /* transient errors: keep polling until timeout */ if (e instanceof Error && /removed|no longer stored/.test(e.message)) patch(j.id, { status: 'failed', error: e.message }); }
        finally { polling.current.delete(j.id); }
      }
    };
    void tick(); const t = setInterval(tick, 10_000); return () => clearInterval(t);
  }, [load]);

  const generate = async () => {
    setMsg(null); startLog.clear(); setBusy(true); abort.current = new AbortController(); const signal = abort.current.signal;
    try {
      if (await runInfo(prompt, startLog, signal)) return;
      const st = await runVideoStart({ prompt, modelId: model, signal, log: startLog, left: remaining('video'), limit: FREE_LIMITS.video, premium: isPremium() });
      const id = uid(); save([{ id, model: st.model.id, op: st.op, prompt: st.prompt, aspect: st.aspect, createdAt: Date.now(), status: 'running' }, ...readJobs()]);
      const lg = logFor(id); lg.say('info', `job started with ${st.model.name}`, 'videos usually take a few minutes; you can leave this page'); setActive(id);
      setMsg({ text: `Started with ${st.model.name} at ${st.aspect}, ${st.model.durations[0]} seconds. You can leave this page.` });
    } catch (e) {
      startLog.settle('failed'); const m = e instanceof Error ? e.message : 'Could not start the video.';
      if (m === 'Cancelled.') startLog.say('warn', 'cancelled'); else startLog.say('err', m);
      setMsg({ text: m, error: m !== 'Cancelled.' });
    } finally { setBusy(false); abort.current = null; }
  };

  return (
    <section className="page">
      <header className="page-head"><h1>Video Studio</h1><span className="muted small">{isPremium() ? 'Unlimited' : `${Math.max(0, FREE_LIMITS.video - used)} of ${FREE_LIMITS.video} free videos left today`}</span></header>
      {!hasKey && <div className="notice">No Google Gemini key connected. <a href="#/providers">Add one</a> to generate video.</div>}
      <div className="panel stack">
        <label className="field">Describe the video<textarea rows={3} value={prompt} maxLength={2000} placeholder="A slow camera push through a neon-lit street in the rain" onChange={(e) => setPrompt(e.target.value)} /></label>
        <div className="row"><Select label="Model" value={model} onChange={setModel} options={[{ value: 'auto', label: 'Auto' }, ...catalog.video.map((v) => ({ value: v.id, label: v.name }))]} /></div>
        <p className="muted small">{m ? `${m.name} makes ${m.durations[0]}-second clips in ${m.aspects.join(', ')}.` : 'Auto picks the best available model for your prompt.'} Models listed are the ones your key can use right now.</p>
        <p className="cmd-hint">Commands: <code>{COMMAND_HELP}</code></p>
        <div className="row">{busy ? <button className="btn" onClick={() => abort.current?.abort()}>Cancel</button> : <button className="btn primary" disabled={!prompt.trim() || !hasKey} onClick={generate}>Generate video</button>}</div>
      </div>
      {getSettings().terminal && <Terminal log={startLog} title="Video workflow" />}
      {getSettings().terminal && active && <Terminal log={logFor(active)} title="Render job" />}
      {msg && <div className={`notice${msg.error ? ' error' : ''}`} role={msg.error ? 'alert' : 'status'}>{msg.text}</div>}
      {jobs.filter((j) => j.status !== 'done').length > 0 && <ul className="list">{jobs.filter((j) => j.status !== 'done').map((j) => (
        <li key={j.id} className="item wrap"><div className="grow"><div className="title">{j.prompt}</div><div className="muted small">{j.status === 'running' ? 'Generating…' : j.status === 'cancelled' ? 'Stopped waiting' : j.error}</div></div>
          {j.status === 'running' && <button className="btn" onClick={() => patch(j.id, { status: 'cancelled' })}>Stop waiting</button>}
          {j.status !== 'running' && <button className="btn" onClick={() => save(readJobs().filter((x) => x.id !== j.id))}>Dismiss</button>}
          {j.status === 'running' && <div className="progress full" aria-hidden="true"><div /></div>}</li>))}</ul>}
      {jobs.some((j) => j.status === 'running') && <p className="muted small">The provider cannot cancel jobs from here. Stopping only stops waiting, and you may still be charged.</p>}
      {items.length > 0 && <div className="grid">{items.map(({ rec, url }) => (
        <figure key={rec.id} className="tile"><video src={url} controls preload="metadata" playsInline />
          <figcaption><button className="btn" onClick={async () => { if ((await platform.saveFile(rec.blob, rec.name)) === 'saved') setMsg({ text: `Saved ${rec.name}.` }); }}>Download</button><button className="btn" onClick={async () => { await deleteMedia(rec.id); await load(); }}>Delete</button></figcaption></figure>))}</div>}
      {items.length > 0 && <p className="muted small">Videos live only on this device. Download the ones you want to keep.</p>}
    </section>
  );
}
