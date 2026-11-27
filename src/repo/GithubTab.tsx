import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Select } from '../ui/Select';
import { AnalyzePanel } from './AnalyzePanel';
import { extractError, logTail, type LogLine } from './buildLog';
import { LogView } from './LogView';
import { jobLog, listRuns, rerunFailed, runJobs, listGithubRepoVariables, createGithubRepoVariable, updateGithubRepoVariable, deleteGithubRepoVariable, listGithubRepoSecrets, putGithubRepoSecret, deleteGithubRepoSecret, type GithubActionVariable, type Job, type Repo, type Run } from './github';
import type { Failure } from './flow';

const ago = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
const BAD = new Set(['failure', 'timed_out', 'startup_failure']);
const runState = (r: Run): 'ok' | 'bad' | 'run' | 'idle' => (r.status !== 'completed' ? 'run' : r.conclusion === 'success' ? 'ok' : r.conclusion && BAD.has(r.conclusion) ? 'bad' : 'idle');
const stepState = (st: { status: string; conclusion: string | null }): 'done' | 'failed' | 'running' | 'pending' => (st.status === 'in_progress' ? 'running' : st.status !== 'completed' ? 'pending' : st.conclusion === 'success' ? 'done' : st.conclusion && BAD.has(st.conclusion) ? 'failed' : 'pending');
const MARK = { done: '✓', failed: '✕', running: '', pending: '○' } as const;
const stamp = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s/;

/** GitHub deployment: the latest workflow run as two cards (build steps, logs). A failed run gets the Analyze button. */
export function GithubTab({ token, repo }: { token: string; repo: Repo | null }) {
  const [runs, setRuns] = useState<Run[]>([]); const [runId, setRunId] = useState(0);
  const [jobs, setJobs] = useState<Job[]>([]); const [log, setLog] = useState<string[]>([]); const [logNote, setLogNote] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [note, setNote] = useState('');
  const [analyze, setAnalyze] = useState(false);
  const [variableName, setVariableName] = useState(''); const [variableValue, setVariableValue] = useState(''); const [variableBusy, setVariableBusy] = useState(false); const [variableNote, setVariableNote] = useState(''); const [envTab, setEnvTab] = useState<'variables'|'secrets'>('variables'); const [repoVars, setRepoVars] = useState<GithubActionVariable[]>([]); const [repoSecrets, setRepoSecrets] = useState<{name:string;created_at?:string;updated_at?:string}[]>([]); const [editingVar, setEditingVar] = useState<string|null>(null);
  const alive = useRef(true); useEffect(() => () => { alive.current = false; }, []);
  const run = runs.find((r) => r.id === runId) ?? runs[0] ?? null;

  const loadRuns = useCallback(async () => {
    if (!repo) return;
    setBusy(true); setError('');
    try { const list = await listRuns(token, repo.full_name); if (!alive.current) return; setRuns(list); setRunId((cur) => (list.some((r) => r.id === cur) ? cur : list[0]?.id ?? 0)); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not read GitHub.'); }
    finally { if (alive.current) setBusy(false); }
  }, [token, repo]);
  useEffect(() => { setRuns([]); setRunId(0); void loadRuns(); }, [loadRuns]);

  // Steps and the log of the chosen run.
  useEffect(() => {
    setJobs([]); setLog([]); setLogNote('');
    if (!repo || !run) return;
    let live = true;
    (async () => {
      try {
        const j = await runJobs(token, repo.full_name, run.id); if (!live) return; setJobs(j);
        const bad = j.find((x) => x.conclusion && BAD.has(x.conclusion)) ?? (runState(run) === 'ok' ? undefined : j[j.length - 1]);
        if (!bad) return;
        try { const text = await jobLog(token, repo.full_name, bad.id); if (live) setLog(text.split('\n').map((t) => t.replace(stamp, ''))); }
        catch { if (live) setLogNote('GitHub did not let the browser read this job’s log. The steps above show where it stopped; open the run on GitHub for the full log.'); }
      } catch (e) { if (live) setError(e instanceof Error ? e.message : 'Could not read the run.'); }
    })();
    return () => { live = false; };
  }, [token, repo, run?.id, run?.status, run?.conclusion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!runs.some((r) => r.status !== 'completed')) return; const t = setInterval(() => void loadRuns(), 10_000); return () => clearInterval(t); }, [runs, loadRuns]);

  const refreshEnv = async () => { if (!repo) return; setVariableBusy(true); try { const [v,s] = await Promise.all([listGithubRepoVariables(token,repo.full_name),listGithubRepoSecrets(token,repo.full_name)]); setRepoVars(v); setRepoSecrets(s); setVariableNote('Environment list refreshed.'); } catch(e) { setVariableNote(e instanceof Error ? e.message : 'Could not load environment settings.'); } finally { setVariableBusy(false); } };
  useEffect(() => { if (repo) void refreshEnv(); else {setRepoVars([]);setRepoSecrets([]);} }, [token,repo?.full_name]);
  const saveVariable = async () => { if (!repo || !variableName.trim()) return; setVariableBusy(true); setVariableNote(''); try { const n=variableName.trim().toUpperCase(); if(editingVar) await updateGithubRepoVariable(token,repo.full_name,editingVar,variableValue); else await createGithubRepoVariable(token,repo.full_name,n,variableValue); setVariableNote(editingVar?`Updated ${editingVar}.`:`Created ${n}.`); setVariableName(''); setVariableValue(''); setEditingVar(null); setRepoVars(await listGithubRepoVariables(token,repo.full_name)); } catch (e) { setVariableNote(e instanceof Error ? e.message : 'Could not save variable.'); } finally { setVariableBusy(false); } };
  const saveSecret = async () => { if(!repo||!variableName.trim()||!variableValue) return; setVariableBusy(true);setVariableNote('');try{const n=variableName.trim().toUpperCase();await putGithubRepoSecret(token,repo.full_name,n,variableValue);setVariableNote(`Secret ${n} created or rotated. GitHub does not return secret values.`);setVariableName('');setVariableValue('');setRepoSecrets(await listGithubRepoSecrets(token,repo.full_name));}catch(e){setVariableNote(e instanceof Error?e.message:'Could not save secret.');}finally{setVariableBusy(false);}};
  const deleteEnvItem = async (name:string, secret:boolean) => {if(!repo||!window.confirm(`Delete ${secret?'secret':'variable'} ${name}? This cannot be undone.`))return;setVariableBusy(true);try{if(secret)await deleteGithubRepoSecret(token,repo.full_name,name);else await deleteGithubRepoVariable(token,repo.full_name,name);setVariableNote(`${name} deleted.`);if(secret)setRepoSecrets(await listGithubRepoSecrets(token,repo.full_name));else setRepoVars(await listGithubRepoVariables(token,repo.full_name));}catch(e){setVariableNote(e instanceof Error?e.message:'Delete failed.');}finally{setVariableBusy(false);}};

  const rerun = async () => { if (!repo || !run) return; setNote(''); try { await rerunFailed(token, repo.full_name, run.id); setNote(`Re-running the failed jobs of #${run.number}.`); setTimeout(() => void loadRuns(), 2500); } catch (e) { setError(e instanceof Error ? e.message : 'Could not re-run.'); } };

  if (!repo) return <div className="rp-card"><p className="rp-muted">Choose a repository.</p></div>;
  const failed = run ? runState(run) === 'bad' : false;
  const failedJob = jobs.find((j) => j.conclusion && BAD.has(j.conclusion));
  const failedStep = failedJob?.steps.find((s) => s.conclusion && BAD.has(s.conclusion));
  const lines: LogLine[] = log.map((text, i) => ({ t: i, type: 'stdout', text }));
  const err = log.length ? extractError(lines) : null;
  const failure: Failure | null = run && failed ? {
    kind: 'github', title: `Workflow “${run.name}” #${run.number}`, repo: repo.full_name, branch: run.branch || repo.default_branch,
    error: err?.text ?? `Workflow failed at ${failedJob ? `${failedJob.name} › ${failedStep?.name ?? 'a step'}` : 'a job'}.`,
    log: log.length ? logTail(lines) : `Failed: ${failedJob?.name ?? ''} ${failedStep?.name ?? ''}`.trim(), named: err?.files ?? [],
  } : null;

  return (
    <div className="rp-stack">
      <div className="rp-bar">
        <Select label="Workflow run" value={String(run?.id ?? '')} options={runs.map((r) => ({ value: String(r.id), label: `#${r.number} · ${r.title.slice(0, 40)} · ${r.status === 'completed' ? r.conclusion : r.status.replace('_', ' ')}` }))} onChange={(v) => setRunId(Number(v))} className="rp-sel" />
        <button className="rp-ib" aria-label="Refresh" disabled={busy} onClick={() => void loadRuns()}><Icon name="refresh" size={18} /></button>
        {failed && <button className="rp-ib" aria-label="Re-run failed jobs" title="Re-run failed jobs" onClick={() => void rerun()}><Icon name="redo" size={18} /></button>}
        {run && <a className="rp-ib" href={run.url} target="_blank" rel="noreferrer" aria-label="Open on GitHub"><Icon name="external-link" size={18} /></a>}
      </div>
      {error && <p className="rp-err" role="alert">{error}</p>}
      {note && <p className="rp-ok" role="status">{note}</p>}
      <section className="rp-card gh-env-manager" aria-label="GitHub Actions environment settings">
        <div className="rp-chead"><h2>GitHub Actions environment</h2><button className="btn sm" disabled={variableBusy} onClick={()=>void refreshEnv()}>Refresh</button></div>
        <p className="rp-sub">Manage repository variables and encrypted Actions secrets. Secret values are never read back from GitHub.</p>
        <div className="gh-env-tabs"><button className={`btn sm ${envTab==='variables'?'primary':''}`} onClick={()=>{setEnvTab('variables');setEditingVar(null);}}>Variables ({repoVars.length})</button><button className={`btn sm ${envTab==='secrets'?'primary':''}`} onClick={()=>{setEnvTab('secrets');setEditingVar(null);}}>Secrets ({repoSecrets.length})</button></div>
        <div className="gh-env-form"><label>Name<input aria-label="Environment name" placeholder="VARIABLE_NAME" value={variableName} onChange={(e)=>setVariableName(e.target.value.toUpperCase())} maxLength={64}/></label><label>{envTab==='secrets'?'Secret value':'Variable value'}<textarea aria-label="Environment value" placeholder={envTab==='secrets'?'Enter secret (write-only)':'Value'} value={variableValue} onChange={(e)=>setVariableValue(e.target.value)} rows={3}/></label><div className="gh-env-actions"><button className="btn primary" disabled={variableBusy||!variableName.trim()||!variableValue} onClick={()=>void (envTab==='secrets'?saveSecret():saveVariable())}>{variableBusy?'Saving…':envTab==='secrets'?'Save / rotate secret':editingVar?'Update variable':'Create variable'}</button>{editingVar&&<button className="btn" onClick={()=>{setEditingVar(null);setVariableName('');setVariableValue('');}}>Cancel edit</button>}</div></div>
        {variableNote&&<p className="rp-muted" role="status">{variableNote}</p>}
        <div className="gh-env-list">{envTab==='variables'?repoVars.map(v=><article className="gh-env-item" key={v.name}><div><strong>{v.name}</strong><p className="rp-sub">Value: {v.value}</p></div><div className="gh-env-actions"><button className="btn sm" onClick={()=>{setEditingVar(v.name);setVariableName(v.name);setVariableValue(v.value);}}>Edit</button><button className="btn sm danger" disabled={variableBusy} onClick={()=>void deleteEnvItem(v.name,false)}>Delete</button></div></article>):repoSecrets.map(v=><article className="gh-env-item" key={v.name}><div><strong>{v.name}</strong><p className="rp-sub">•••••••• · write-only secret</p></div><div className="gh-env-actions"><button className="btn sm" onClick={()=>{setVariableName(v.name);setVariableValue('');}}>Rotate</button><button className="btn sm danger" disabled={variableBusy} onClick={()=>void deleteEnvItem(v.name,true)}>Delete</button></div></article>)}</div>
        {envTab==='variables'&&!repoVars.length&&<p className="rp-muted">No repository variables found.</p>}{envTab==='secrets'&&!repoSecrets.length&&<p className="rp-muted">No repository secrets found.</p>}
      </section>
      <section className="rp-card" aria-label="Build steps">
        <div className="rp-chead"><h2>Build steps</h2>{run && <span className={`rp-pill ${runState(run)}`}>{run.status === 'completed' ? run.conclusion : run.status.replace('_', ' ')}</span>}</div>
        {run ? <>
          <p className="rp-sub">{run.title}<span>{run.sha.slice(0, 7)} · {run.branch} · {ago(run.created)}</span></p>
          {jobs.length ? jobs.map((j) => (
            <div key={j.id} className="rp-job"><h3>{j.name}</h3>
              <ol className="rp-steps">{j.steps.map((st) => { const state = stepState(st); return <li key={st.number} className={state}><span className="rp-mark" aria-hidden="true">{state === 'running' ? <span className="spin" /> : MARK[state]}</span>{st.name}</li>; })}</ol>
            </div>)) : <p className="rp-muted">{busy ? 'Loading…' : 'No jobs yet.'}</p>}
        </> : <p className="rp-muted">{busy ? 'Loading…' : 'No workflow runs.'}</p>}
      </section>
      <section className="rp-card" aria-label="Build logs">
        <div className="rp-chead"><h2>Build logs</h2>{failed && <span className="rp-pill bad">failed</span>}</div>
        {log.length ? <LogView lines={log} /> : <p className="rp-muted">{logNote || (failed ? 'Reading the log…' : run && runState(run) === 'ok' ? 'The latest run succeeded.' : '—')}</p>}
      </section>
      {failure && <button className="btn primary rp-analyze" onClick={() => setAnalyze(true)}>Analyze</button>}
      {analyze && failure && <AnalyzePanel failure={failure} token={token} onClose={() => setAnalyze(false)} onCommitted={() => setTimeout(() => void loadRuns(), 5000)} />}
    </div>
  );
}
