import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteMedia, listLibrary, uid, type MediaRecord } from '../storage/db';
import { defaultKeys } from '../vault/vault';
import { addJob, patchJob, readJobs, saveJobs, type Job } from '../agent/jobs';
import { cachedCatalog, refreshCatalog } from '../agent/detect';
import { RunLog, logFor } from '../agent/log';
import { runInfo, runVideoStart } from '../agent/workflow';
import { Terminal } from '../ui/Terminal';
import { platform } from '../platform';
import { getSettings } from '../settings';
import { Select } from '../ui/Select';

export function VideoStudio() {
  const [prompt, setPrompt] = useState(() => sessionStorage.getItem('studio.prompt') ?? '');
  const [catalog, setCatalog] = useState(cachedCatalog);
  const [active, setActive] = useState<string | null>(null);
  const startLog = useRef(new RunLog()).current; const [busy, setBusy] = useState(false); const abort = useRef<AbortController | null>(null);
  const [model, setModel] = useState(getSettings().videoModel);
  const [jobs, setJobs] = useState<Job[]>(readJobs());
  const [items, setItems] = useState<{ rec: MediaRecord; url: string }[]>([]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const urls = useRef<string[]>([]);
  const hasKey = defaultKeys('video').length > 0;
  const m = catalog.video.find((x) => x.id === model);
  useEffect(() => { sessionStorage.removeItem('studio.prompt'); setCatalog(cachedCatalog()); if (hasKey) void refreshCatalog().then(setCatalog); }, [hasKey]);

  const save = (next: Job[]) => { saveJobs(next); setJobs(next); };
  const patch = (id: string, p: Partial<Job>) => { patchJob(id, p); setJobs(readJobs()); };
  const load = useCallback(async () => {
    const recs = (await listLibrary()).filter((r) => r.kind === 'video');
    urls.current.forEach(URL.revokeObjectURL);
    const next = recs.map((rec) => ({ rec, url: URL.createObjectURL(rec.blob) })); urls.current = next.map((n) => n.url); setItems(next);
  }, []);
  useEffect(() => { void load(); return () => urls.current.forEach(URL.revokeObjectURL); }, [load]);

  // Poll running jobs; survives refreshes because jobs live in localStorage (no secrets).
  useEffect(() => {
    const sync = () => { setJobs(readJobs()); void load(); };
    window.addEventListener('jobs:changed', sync); window.addEventListener('library:changed', sync);
    return () => { window.removeEventListener('jobs:changed', sync); window.removeEventListener('library:changed', sync); };
  }, [load]);

  const generate = async () => {
    setMsg(null); startLog.clear(); setBusy(true); abort.current = new AbortController(); const signal = abort.current.signal;
    try {
      if (await runInfo(prompt, startLog, signal)) return;
      const st = await runVideoStart({ prompt, modelId: model, signal, log: startLog });
      const id = uid(); addJob({ id, provider: st.model.provider, keyId: st.keyId, model: st.model.id, op: st.op, prompt: st.prompt, aspect: st.aspect, createdAt: Date.now(), status: 'running' }); setJobs(readJobs());
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
      <header className="page-head"><h1>Video Studio</h1><span className="muted small">Unlimited</span></header>
      {!hasKey && <div className="notice">No default video key. <a href="#/providers">Add an API key</a> and tick it as default for Video.</div>}
      <div className="panel stack">
        <label className="field">Describe the video<textarea rows={3} value={prompt} maxLength={2000} placeholder="A slow camera push through a neon-lit street in the rain" onChange={(e) => setPrompt(e.target.value)} /></label>
        <div className="row"><Select label="Model" value={model} onChange={setModel} options={[{ value: 'auto', label: 'Auto' }, ...catalog.video.map((v) => ({ value: v.id, label: v.name }))]} /></div>
        <p className="muted small">{m ? `${m.name} makes ${m.durations[0]}-second clips in ${m.aspects.join(', ')}.` : 'Auto picks the best available model for your prompt.'} Models listed are the ones your key can use right now.</p>
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
