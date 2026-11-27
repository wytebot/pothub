import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Select } from '../ui/Select';
import { AnalyzePanel } from './AnalyzePanel';
import { buildSteps, extractError, logTail, type BuildStep, type LogLine } from './buildLog';
import { LogView } from './LogView';
import { isBuilding, isFailed, loadVercelSession, loadVercelToken, saveVercelToken, signOutVercel, startVercelSignIn, vcDeployments, vcEvents, vcProjects, setVercelProjectVariable, type VcDeployment, type VcProject } from './vercel';
import type { Failure } from './flow';
import type { Repo } from './github';

const ago = (ms: number) => { if (!ms) return ''; const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
const MARK: Record<BuildStep['state'], string> = { done: '✓', failed: '✕', running: '', pending: '○' };

/** Vercel deployment: connect once, then two cards (build steps, build logs) and, when the build failed, the Analyze button. */
export function VercelTab({ ghToken, repo }: { ghToken: string; repo: Repo | null }) {
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [oauth, setOauth] = useState(false); const [signing, setSigning] = useState(false);
  const [projects, setProjects] = useState<VcProject[]>([]); const [pid, setPid] = useState('');
  const [dep, setDep] = useState<VcDeployment | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [analyze, setAnalyze] = useState(false);
  const [varName, setVarName] = useState(''); const [varValue, setVarValue] = useState(''); const [varBusy, setVarBusy] = useState(false); const [varNote, setVarNote] = useState('');
  const project = projects.find((p) => p.id === pid) ?? null;
  const alive = useRef(true); useEffect(() => () => { alive.current = false; }, []);

  const fail = (e: unknown, fallback: string) => { if (alive.current) setError(e instanceof Error ? e.message : fallback); };
  const loadProjects = useCallback(async (t: string) => {
    setBusy(true); setError('');
    try {
      const list = await vcProjects(t); if (!alive.current) return;
      setProjects(list);
      const saved = localStorage.getItem('pothub.vercel.project') || '';
      const match = list.find((p) => repo && p.repo.toLowerCase() === repo.full_name.toLowerCase()) ?? list.find((p) => p.id === saved) ?? list[0];
      setPid(match?.id ?? '');
      if (!list.length) setError('This token can see no Vercel projects.');
    } catch (e) { fail(e, 'Could not reach Vercel.'); } finally { if (alive.current) setBusy(false); }
  }, [repo]);
  useEffect(() => { void loadVercelSession().then((x) => setOauth(!!x?.oauth)); void loadVercelToken().then((t) => { setToken(t); if (t) void loadProjects(t); }); }, [loadProjects]);
  // A different repository selects the Vercel project linked to it.
  useEffect(() => { const m = projects.find((p) => repo && p.repo.toLowerCase() === repo.full_name.toLowerCase()); if (m) setPid(m.id); }, [repo, projects]);

  const refresh = useCallback(async () => {
    if (!token || !project) return;
    try {
      const list = await vcDeployments(token, project); if (!alive.current) return;
      const latest = list[0] ?? null; setDep(latest); setError('');
      setLines(latest ? await vcEvents(token, project, latest.id).catch(() => []) : []);
    } catch (e) { fail(e, 'Could not read deployments.'); }
  }, [token, project]);
  useEffect(() => { setDep(null); setLines([]); if (project) { localStorage.setItem('pothub.vercel.project', project.id); setBusy(true); void refresh().finally(() => { if (alive.current) setBusy(false); }); } }, [project?.id, refresh]);
  // While a build is running the cards keep up with it.
  useEffect(() => { if (!dep || !isBuilding(dep.state)) return; const t = setInterval(() => void refresh(), 8000); return () => clearInterval(t); }, [dep, refresh]);

  const connect = async () => {
    const t = input.trim(); if (!t) return;
    setBusy(true); setError('');
    try { const list = await vcProjects(t); await saveVercelToken(t); setToken(t); setInput(''); setProjects(list); setPid(list.find((p) => repo && p.repo.toLowerCase() === repo.full_name.toLowerCase())?.id ?? list[0]?.id ?? ''); }
    catch (e) { fail(e, 'Could not connect to Vercel.'); } finally { setBusy(false); }
  };
  const saveVariable = async () => { if (!token || !project || !varName.trim()) return; setVarBusy(true); setVarNote(''); try { await setVercelProjectVariable(token, project.id, project.team, varName.trim().toUpperCase(), varValue); setVarNote(`Saved ${varName.toUpperCase()} as a non-sensitive Vercel environment variable for Production, Preview and Development.`); setVarName(''); setVarValue(''); } catch (e) { setVarNote(e instanceof Error ? e.message : 'Could not save Vercel variable.'); } finally { setVarBusy(false); } };
  const signIn = async () => { setError(''); setSigning(true); try { await startVercelSignIn(); } catch (e) { fail(e, 'Could not start Vercel sign-in.'); setSigning(false); } };
  const disconnect = async () => { await signOutVercel(); setToken(''); setOauth(false); setProjects([]); setPid(''); setDep(null); setLines([]); };

  if (token === null) return <div className="rp-card"><p className="rp-muted">Loading…</p></div>;
  if (!token) return (
    <div className="rp-card rp-connect">
      <h2>Connect Vercel</h2>
      <button className="btn primary" disabled={signing || busy} onClick={() => void signIn()}>{signing ? 'Opening Vercel…' : 'Connect Vercel'}</button>
      <details className="rp-adv"><summary>Use an access token instead</summary>
        <input type="password" autoComplete="off" spellCheck={false} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void connect(); }} placeholder="Vercel access token" aria-label="Vercel access token" />
        <button className="btn" disabled={busy || !input.trim()} onClick={() => void connect()}>{busy ? 'Connecting…' : 'Connect with token'}</button>
        <a className="rp-muted" href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer">Create a token</a>
      </details>
      {error && <p className="rp-err" role="alert">{error}</p>}
    </div>
  );

  const state = dep?.state ?? '';
  const steps = dep ? buildSteps(lines, state) : [];
  const err = dep && isFailed(state) ? extractError(lines) : null;
  const logText = lines.flatMap((l) => l.text.split('\n')).filter((t) => t.trim());
  const failure: Failure | null = dep && project && isFailed(state) ? {
    kind: 'vercel', title: `Vercel build ${dep.sha.slice(0, 7) || dep.id}`, repo: project.repo || dep.repo || repo?.full_name || '',
    branch: dep.branch || repo?.default_branch || 'main', error: err?.text ?? 'The build failed, but no error line was recognised in the log.', log: logTail(lines), named: err?.files ?? [],
  } : null;

  return (
    <div className="rp-stack">
      <div className="rp-bar">
        <Select label="Vercel project" value={pid} options={projects.map((p) => ({ value: p.id, label: p.name }))} onChange={setPid} className="rp-sel" />
        <button className="rp-ib" aria-label="Refresh" disabled={busy} onClick={() => { setBusy(true); void refresh().finally(() => { if (alive.current) setBusy(false); }); }}><Icon name="refresh" size={18} /></button>
        <button className="rp-ib" aria-label="Disconnect Vercel" onClick={() => void disconnect()}><Icon name="close" size={18} /></button>
      </div>
      {error && <p className="rp-err" role="alert">{error}{oauth && /refused/i.test(error) ? ' Vercel’s sign-in can only read deployments when its API permissions are enabled for your Vercel App. Disconnect and use an access token instead.' : ''}</p>}
      <section className="rp-card" aria-label="Vercel environment variables">
        <div className="rp-chead"><h2>Environment variables</h2><span className="rp-pill idle">Non-secret</span></div>
        <p className="rp-sub">Add plain variables to the selected Vercel project in all environments. Sensitive values are blocked.</p>
        <div className="rp-bar rp-var-form"><input aria-label="Environment variable name" placeholder="VARIABLE_NAME" value={varName} onChange={(e) => setVarName(e.target.value.toUpperCase())} maxLength={64}/><input aria-label="Environment variable value" placeholder="Non-sensitive value" value={varValue} onChange={(e) => setVarValue(e.target.value)} maxLength={5000}/><button className="btn" disabled={varBusy || !varName.trim()} onClick={() => void saveVariable()}>{varBusy ? 'Saving…' : 'Save'}</button></div>
        {varNote && <p className="rp-muted" role="status">{varNote}</p>}
      </section>
      <section className="rp-card" aria-label="Build steps">
        <div className="rp-chead"><h2>Build steps</h2>{dep && <span className={`rp-pill ${isFailed(state) ? 'bad' : isBuilding(state) ? 'run' : 'ok'}`}>{state.toLowerCase()}</span>}</div>
        {dep ? <>
          <p className="rp-sub">{dep.message || dep.id}<span>{dep.sha.slice(0, 7)}{dep.branch ? ` · ${dep.branch}` : ''} · {ago(dep.created)}</span></p>
          <ol className="rp-steps">{steps.map((s) => <li key={s.id} className={s.state}><span className="rp-mark" aria-hidden="true">{s.state === 'running' ? <span className="spin" /> : MARK[s.state]}</span>{s.label}</li>)}</ol>
        </> : <p className="rp-muted">{busy ? 'Loading…' : 'No deployments yet.'}</p>}
      </section>
      <section className="rp-card" aria-label="Build logs">
        <div className="rp-chead"><h2>Build logs</h2>{err && <span className="rp-pill bad">failed</span>}</div>
        {logText.length ? <LogView lines={logText} /> : <p className="rp-muted">{busy ? 'Loading…' : dep ? 'No log lines yet.' : '—'}</p>}
      </section>
      {failure && <button className="btn primary rp-analyze" onClick={() => setAnalyze(true)}>Analyze</button>}
      {analyze && failure && <AnalyzePanel failure={failure} token={ghToken} onClose={() => setAnalyze(false)} onCommitted={() => setTimeout(() => void refresh(), 20_000)} />}
    </div>
  );
}
