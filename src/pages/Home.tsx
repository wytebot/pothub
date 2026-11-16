import { useEffect, useState } from 'react';
import { createProject, listProjects, type ProjectRecord } from '../storage/db';
import { fmtBytes, getStorageInfo, type StorageInfo } from '../storage/quota';
import { FREE_LIMITS, isPremium, usage } from '../quota/daily';
import { listKeys } from '../vault/vault';
import { interpret } from '../models/router';
import { parseCommands } from '../agent/commands';

export function Home() {
  const [recent, setRecent] = useState<ProjectRecord[] | null>(null);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [err, setErr] = useState('');
  const [idea, setIdea] = useState('');
  const u = usage();
  const providers = new Set(listKeys().filter((k) => k.status !== 'invalid').map((k) => k.provider)).size;
  useEffect(() => {
    listProjects().then((p) => setRecent(p.slice(0, 4))).catch(() => { setRecent([]); setErr('Projects could not be read. Check that this browser allows site storage.'); });
    getStorageInfo().then(setInfo).catch(() => {});
  }, []);
  const go = () => { const { flags, text } = parseCommands(idea); sessionStorage.setItem('studio.prompt', idea.trim()); location.hash = (flags.task ?? interpret(text).task) === 'video' ? '/video' : '/image'; };
  return (
    <section className="page">
      <header className="page-head">
        <h1>Home</h1>
        <button className="btn" onClick={async () => { try { await createProject(); location.hash = '/projects'; } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create the project.'); } }}>New project</button>
      </header>
      {err && <div className="notice error" role="alert">{err}</div>}
      <div className="panel stack">
        <h2>Create</h2>
        <div className="row nowrap">
          <input className="grow" value={idea} placeholder="Describe an image or a video. Pothub picks the right studio" onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && idea.trim()) go(); }} />
          <button className="btn primary" disabled={!idea.trim()} onClick={go}>Create</button>
        </div>
      </div>
      <div className="stats">
        <div className="panel"><div className="stat">{isPremium() ? '∞' : Math.max(0, FREE_LIMITS.image - u.image)}</div><div className="muted small">images left today</div></div>
        <div className="panel"><div className="stat">{isPremium() ? '∞' : Math.max(0, FREE_LIMITS.video - u.video)}</div><div className="muted small">videos left today</div></div>
        <div className="panel"><div className="stat">{providers}</div><div className="muted small">providers connected</div></div>
        <div className="panel"><div className="stat">{isPremium() ? 'Premium' : 'Free'}</div><div className="muted small">plan</div></div>
      </div>
      <div className="panel">
        <h2>Recent projects</h2>
        {recent === null ? <p className="muted">Loading…</p> : recent.length === 0 ? <p className="muted">Nothing here yet. Create a project to get started.</p> : (
          <ul className="list flush">{recent.map((p) => <li key={p.id} className="item"><div className="thumb" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</div><a className="title grow" href="#/projects">{p.name}</a></li>)}</ul>
        )}
      </div>
      {info?.supported && <p className="muted small">Your work uses {fmtBytes(info.usage)} on this device and exists nowhere else. Export projects you want to keep.</p>}
    </section>
  );
}
