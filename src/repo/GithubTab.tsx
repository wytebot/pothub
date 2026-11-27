import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Select } from '../ui/Select';
import { AnalyzePanel } from './AnalyzePanel';
import { extractError, logTail, type LogLine } from './buildLog';
import { LogView } from './LogView';
import { jobLog, listRuns, rerunFailed, runJobs, setGithubRepoVariable, type Job, type Repo, type Run } from './github';
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
  const [variableName, setVariableName] = useState(''); const [variableValue, setVariableValue] = useState(''); const [variableBusy, setVariableBusy] = useState(false); const [variableNote, setVariableNote] = useState('');
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

  const saveVariable = async () => { if (!repo || !variableName.trim()) return; setVariableBusy(true); setVariableNote(''); try { await setGithubRepoVariable(token, repo.full_name, variableName.trim().toUpperCase(), variableValue); setVariableNote(`Saved ${variableName.toUpperCase()} as a GitHub Actions repository variable.`); setVariableName(''); setVariableValue(''); } catch (e) { setVariableNote(e instanceof Error ? e.message : 'Could not save variable.'); } finally { setVariableBusy(false); } };

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
      <section className="rp-card" aria-label="GitHub repository variables">
        <div className="rp-chead"><h2>Repository variables</h2><span className="rp-pill idle">Non-secret</span></div>
        <p className="rp-sub">Set plain GitHub Actions variables. Sensitive values are rejected; use repository Secrets for credentials.</p>
        <div className="rp-bar"><input aria-label="Variable name" placeholder="VARIABLE_NAME" value={variableName} onChange={(e) => setVariableName(e.target.value.toUpperCase())} maxLength={64}/><input aria-label="Variable value" placeholder="Value (non-sensitive)" value={variableValue} onChange={(e) => setVariableValue(e.target.value)} maxLength={5000}/><button className="btn" disabled={variableBusy || !variableName.trim()} onClick={() => void saveVariable()}>{variableBusy ? 'Saving…' : 'Save'}</button></div>
        {variableNote && <p className="rp-muted" role="status">{variableNote}</p>}
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
