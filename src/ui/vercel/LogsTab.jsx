import React from 'react';
import { ArrowLeft, Copy, ExternalLink, RefreshCw, Wrench } from 'lucide-react';
import { isBuilding, isFailed, isReady, stateLabel, stateOf } from '../../lib/vercel-env.js';

const when = (t) => { try { return t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; } catch { return ''; } };
const tone = (state) => (isReady(state) ? 'ok' : isFailed(state) ? 'bad' : isBuilding(state) ? 'live' : 'idle');

function Pill({ state }) { return <span className={`vx-state ${tone(state)}`}>{isBuilding(state) && <i aria-hidden="true" />}{stateLabel(state)}</span>; }

/** Deployment monitor: the list, and a live build log that keeps updating until the build finishes. */
export default function LogsTab({ api, project, focusId, onFix, onCopy }) {
  const [deployments, setDeployments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [openId, setOpenId] = React.useState(focusId || '');
  const [detail, setDetail] = React.useState({ state: '', url: '', logs: '' });
  const [copied, setCopied] = React.useState(false);
  const apiRef = React.useRef(api); apiRef.current = api;
  const logRef = React.useRef(null);
  const stick = React.useRef(true);

  React.useEffect(() => { if (focusId) setOpenId(focusId); }, [focusId]);

  const loadList = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { const d = await apiRef.current('/api/vercel/deployments'); setDeployments(d.deployments || []); setError(''); }
    catch (e) { setError(String(e?.message || e)); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { loadList(); }, [loadList, project?.id]);

  // Keep the list fresh while something is building.
  React.useEffect(() => {
    if (openId || !deployments.some((d) => isBuilding(stateOf(d)))) return undefined;
    const t = setInterval(() => loadList(true), 6000);
    return () => clearInterval(t);
  }, [deployments, openId, loadList]);

  // Poll the open deployment's status and log until it reaches a final state.
  React.useEffect(() => {
    if (!openId) return undefined;
    let alive = true, timer = 0;
    setDetail({ state: '', url: '', logs: '' }); stick.current = true;
    const tick = async () => {
      let state = '';
      try {
        const [s, l] = await Promise.all([
          apiRef.current(`/api/vercel/deployment-status?deploymentId=${encodeURIComponent(openId)}`),
          apiRef.current(`/api/vercel/deployment-logs?deploymentId=${encodeURIComponent(openId)}`).catch(() => null),
        ]);
        if (!alive) return;
        state = String(s.state || '').toUpperCase();
        setDetail((old) => ({ state, url: s.url || old.url, logs: l ? String(l.logs || '') : old.logs }));
        setError('');
      } catch (e) { if (alive) setError(String(e?.message || e)); }
      if (alive && (!state || isBuilding(state))) timer = setTimeout(tick, 3000);
      else if (alive) loadList(true);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [openId, loadList]);

  React.useEffect(() => { const el = logRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [detail.logs]);

  async function copy() {
    try { await navigator.clipboard.writeText(detail.logs || ''); setCopied(true); setTimeout(() => setCopied(false), 1600); onCopy?.(); } catch { /* clipboard can be blocked */ }
  }

  if (!project) return <section className="vx-card"><p className="vx-empty">Pick a project in Import first. Its deployments and build logs appear here.</p></section>;

  if (openId) {
    const state = detail.state || stateOf(deployments.find((d) => d.id === openId));
    return (
      <div className="vx-stack">
        <section className="vx-card vx-monitor">
          <header className="vx-monitor-head">
            <button type="button" className="vx-icon-btn" aria-label="Back to deployments" onClick={() => setOpenId('')}><ArrowLeft size={18} /></button>
            <div><h2>{project.name}</h2><small>{openId.slice(0, 18)}</small></div>
            <Pill state={state || 'QUEUED'} />
          </header>
          {isBuilding(state || 'QUEUED') && <div className="vx-progress" role="progressbar" aria-label="Build in progress"><i /></div>}
          <pre className="vx-log" ref={logRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }} tabIndex={0}>{detail.logs || (isBuilding(state || 'QUEUED') ? 'Waiting for the first build output…' : 'Vercel returned no log lines for this deployment.')}</pre>
          {error && <p className="vx-field-error" role="alert">{error}</p>}
          <div className="vx-actions">
            <button type="button" className="secondary" onClick={copy} disabled={!detail.logs}><Copy size={15} aria-hidden="true" /> {copied ? 'Copied' : 'Copy logs'}</button>
            {isReady(state) && detail.url && <a className="secondary vx-btn-link" href={detail.url} target="_blank" rel="noreferrer">Visit <ExternalLink size={14} aria-hidden="true" /></a>}
            {isFailed(state) && <button type="button" className="primary" onClick={() => onFix({ deploymentId: openId, logs: detail.logs, project })}><Wrench size={15} aria-hidden="true" /> Fix with AI</button>}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="vx-stack">
      <section className="vx-card">
        <header className="vx-card-head"><h2>Deployments</h2><button type="button" className="vx-link" onClick={() => loadList()} disabled={loading}><RefreshCw size={14} aria-hidden="true" className={loading ? 'spin' : ''} /> Refresh</button></header>
        <p className="vx-sub">{project.name}</p>
        {loading && deployments.length === 0 && <div className="vx-skeletons"><i /><i /><i /></div>}
        {!loading && deployments.length === 0 && !error && <p className="vx-empty">No deployments yet. Open the project in Import and tap Deploy.</p>}
        {error && <p className="vx-field-error" role="alert">{error}</p>}
        <ul className="vx-list">
          {deployments.map((d) => {
            const state = stateOf(d);
            return (
              <li key={d.id}>
                <button type="button" className="vx-item" onClick={() => setOpenId(d.id)}>
                  <span className="vx-item-copy"><strong>{d.meta?.githubCommitMessage ? String(d.meta.githubCommitMessage).split('\n')[0].slice(0, 70) : (d.url || d.name || 'Deployment').replace(/^https?:\/\//, '')}</strong><small>{when(d.createdAt)}</small></span>
                  <Pill state={state} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
