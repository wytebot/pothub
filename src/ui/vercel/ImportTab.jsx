import React from 'react';
import { ExternalLink, Github, RefreshCw } from 'lucide-react';
import ProjectSheet from './ProjectSheet.jsx';
import ReauthNotice from './ReauthNotice.jsx';
import { assignedUrl, linkedRepo, needsVercelReauth } from '../../lib/vercel-env.js';

/**
 * Projects tab. It lists the projects that already exist on the connected Vercel account (read live from
 * Vercel), each with its Vercel domain and a checkbox. The ticked project drives Variables, Logs and
 * AI backend. Deployed projects are read from the account, so there is no import step.
 */
export default function ImportTab({ api, onRefresh, projects, selectedId, onSelect, onDeployed, onNotice, onReauthorize }) {
  const [sheet, setSheet] = React.useState(null);
  const [working, setWorking] = React.useState('');
  const [error, setError] = React.useState('');
  const [reauth, setReauth] = React.useState(false);
  const [query, setQuery] = React.useState('');

  // Re-read the account when the person returns to the app (for example after deploying on Vercel).
  React.useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible') onRefresh?.(); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [onRefresh]);

  async function pick(project) {
    setError(''); setReauth(false); setWorking(project.id);
    try { await onSelect(project); setSheet(project); }
    catch (e) { setError(String(e?.message || e)); setReauth(needsVercelReauth(e)); }
    finally { setWorking(''); }
  }

  async function toggle(project) {
    setError(''); setReauth(false); setWorking(project.id);
    try { await onSelect(selectedId === project.id ? null : project); }
    catch (e) { setError(String(e?.message || e)); setReauth(needsVercelReauth(e)); }
    finally { setWorking(''); }
  }

  const q = query.trim().toLowerCase();
  const shown = q ? projects.filter((p) => `${p.name} ${linkedRepo(p)} ${(p.domains || []).join(' ')}`.toLowerCase().includes(q)) : projects;

  return (
    <div className="vx-stack">
      <section className="vx-card">
        <header className="vx-card-head"><h2>Your Vercel projects</h2><span>{projects.length}</span></header>
        <div className="vx-actions-row">
          <button type="button" className="secondary vx-small" onClick={() => onRefresh?.()}><RefreshCw size={14} aria-hidden="true" /> Refresh from Vercel</button>
        </div>
        {projects.length > 6 && <input className="vx-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" aria-label="Search projects" autoCapitalize="none" autoCorrect="off" spellCheck="false" />}
        {projects.length === 0 && <p className="vx-empty">No projects were found on this Vercel account yet. Projects you deploy on Vercel appear here automatically.</p>}
        {projects.length > 0 && <p className="vx-hint">Tick a project to use it. Variables, Logs and AI backend then show that project.</p>}
        <ul className="vx-list">
          {shown.map((p) => {
            const on = selectedId === p.id, url = assignedUrl(p), repo = linkedRepo(p);
            return (
              <li key={`${p.id}:${p.teamId || ''}`} className={`vx-project${on ? ' active' : ''}`}>
                <label className="vx-check">
                  <input type="checkbox" checked={on} disabled={!!working} onChange={() => toggle(p)} aria-label={`Use ${p.name}`} />
                  <span aria-hidden="true" />
                </label>
                <div className="vx-project-main">
                  <button type="button" className="vx-project-name" onClick={() => pick(p)} disabled={!!working}>
                    <strong>{p.name}</strong><small>{p.framework || 'Vercel project'}</small>
                    {working === p.id && <span className="vx-spinner" aria-label="Opening" />}
                  </button>
                  {url
                    ? <a className="vx-url-btn" href={url} target="_blank" rel="noreferrer"><span>{url.replace(/^https:\/\//, '')}</span><ExternalLink size={14} aria-hidden="true" /></a>
                    : <span className="vx-url-btn empty">No domain assigned yet</span>}
                  {repo && <small className="vx-repo-line"><Github size={12} aria-hidden="true" /> {repo}</small>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {reauth ? <ReauthNotice onReauthorize={() => (onReauthorize ? onReauthorize() : onNotice?.('Reconnect Vercel to continue.'))} /> : error && <div className="vx-notice error" role="alert"><div><p>{error}</p></div></div>}

      {sheet && <ProjectSheet key={sheet.id} project={sheet} api={api} onClose={() => setSheet(null)} onReauthorize={() => (onReauthorize ? onReauthorize() : onNotice?.('Reconnect Vercel to continue.'))} onNotice={onNotice} onDeployed={(info) => { setSheet(null); onDeployed(info); }} />}
    </div>
  );
}
