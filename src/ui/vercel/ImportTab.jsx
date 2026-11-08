import React from 'react';
import { ExternalLink, Github, RefreshCw, Search } from 'lucide-react';
import ProjectSheet from './ProjectSheet.jsx';
import ReauthNotice from './ReauthNotice.jsx';
import AccessTokenCard from './AccessTokenCard.jsx';
import { assignedUrl, githubStatusFrom, linkedRepo, needsVercelReauth } from '../../lib/vercel-env.js';

export default function ImportTab({ api, onRefresh, projects, selectedId, onSelect, onProjectAdded, onConnectGithub, onSwitchGithub, onReauthorize, onDeployed, onNotice }) {
  const [sheet, setSheet] = React.useState(null);
  const [gh, setGh] = React.useState('checking');
  const [repos, setRepos] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [showAll, setShowAll] = React.useState(false);
  const [working, setWorking] = React.useState('');
  const [error, setError] = React.useState('');
  const [reauth, setReauth] = React.useState(false);
  const [createBlocked, setCreateBlocked] = React.useState('');
  const [hasToken, setHasToken] = React.useState(false);
  React.useEffect(() => { api('/api/vercel/status').then((d) => setHasToken(!!d?.hasPersonalToken)).catch(() => {}); }, [api]);
  const apiRef = React.useRef(api); apiRef.current = api;

  const loadRepos = React.useCallback(async () => {
    setGh('checking');
    try {
      const data = await apiRef.current('/api/github/repos', { timeoutMs: 20000 });
      setRepos(data.repos || data.repositories || []);
      setGh(githubStatusFrom({ data }));
    } catch (e) { setRepos([]); setGh(githubStatusFrom({ error: e })); }
  }, []);
  React.useEffect(() => { loadRepos(); }, [loadRepos]);
  // After the person imports a repository on Vercel's own page and comes back, pick up the new project by itself.
  const waitingRef = React.useRef(false);
  React.useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible' && waitingRef.current) { waitingRef.current = false; onRefresh?.(); } };
    document.addEventListener('visibilitychange', back); window.addEventListener('focus', back);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [onRefresh]);
  const vercelImportUrl = (fullName) => fullName ? `https://vercel.com/new/import?s=${encodeURIComponent(`https://github.com/${fullName}`)}` : 'https://vercel.com/new';
  function openVercelImport(fullName) { waitingRef.current = true; window.open(vercelImportUrl(fullName), '_blank', 'noopener'); }

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

  async function importRepo(repo) {
    setError(''); setReauth(false); setCreateBlocked(''); setWorking(repo.full_name);
    try {
      const d = await api('/api/vercel/import-github', { method: 'POST', body: JSON.stringify({ repoFullName: repo.full_name }), timeoutMs: 40000, noRetry: true });
      const project = { ...d.project, name: d.project.name, domains: d.project.domains || [] };
      onProjectAdded(project);
      setSheet(project);
    } catch (e) {
      setError(String(e?.message || e)); setReauth(needsVercelReauth(e));
      if (e?.code === 'VERCEL_CREATE_NOT_ALLOWED') setCreateBlocked(`https://vercel.com/new/import?s=${encodeURIComponent(`https://github.com/${repo.full_name}`)}`);
    }
    finally { setWorking(''); }
  }

  const importedRepos = new Set(projects.map((p) => linkedRepo(p).toLowerCase()).filter(Boolean));
  const q = query.trim().toLowerCase();
  const matches = repos.filter((r) => !q || String(r.full_name || '').toLowerCase().includes(q));
  const visible = showAll || q ? matches : matches.slice(0, 5);

  return (
    <div className="vx-stack">
      <section className="vx-card">
        <header className="vx-card-head"><h2>Your projects</h2><span>{projects.length}</span></header>
        <div className="vx-actions-row">
          <button type="button" className="secondary vx-small" onClick={() => openVercelImport('')}>Import new on Vercel</button>
          <button type="button" className="secondary vx-small" onClick={() => onRefresh?.()}><RefreshCw size={14} aria-hidden="true" /> Refresh</button>
        </div>
        {projects.length === 0 && <p className="vx-empty">No Vercel projects yet. Tap “Import new on Vercel”, import your repository there, then come back. PotHub refreshes by itself.</p>}
        {projects.length > 0 && <p className="vx-hint">Tick a project to use it. Variables, Logs and AI backend then show that project.</p>}
        <ul className="vx-list">
          {projects.map((p) => {
            const on = selectedId === p.id, url = assignedUrl(p);
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
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="vx-card">
        <header className="vx-card-head"><h2>Import from GitHub</h2>
          {gh === 'connected' && <button type="button" className="vx-link" onClick={onSwitchGithub}>Use another account</button>}
        </header>

        {gh === 'checking' && <div className="vx-skeletons" aria-label="Checking GitHub"><i /><i /><i /></div>}

        {gh === 'missing' && (
          <div className="vx-empty-action">
            <Github size={22} aria-hidden="true" />
            <p>Connect GitHub to choose a repository to import.</p>
            <button type="button" className="primary" onClick={onConnectGithub}>Connect GitHub</button>
          </div>
        )}

        {gh === 'error' && (
          <div className="vx-empty-action">
            <p>Couldn’t load your GitHub repositories right now. Your GitHub connection is not affected.</p>
            <button type="button" className="secondary" onClick={loadRepos}><RefreshCw size={15} aria-hidden="true" /> Try again</button>
          </div>
        )}

        {gh === 'connected' && <>
          <label className="vx-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your repositories" aria-label="Search repositories" autoCapitalize="none" autoCorrect="off" spellCheck="false" /></label>
          {visible.length === 0 && <p className="vx-empty">{repos.length ? 'No repository matches that search.' : 'No repositories were found on this GitHub account.'}</p>}
          <ul className="vx-list">
            {visible.map((r) => {
              const done = importedRepos.has(String(r.full_name).toLowerCase());
              return (
                <li key={r.full_name} className="vx-repo">
                  <span className="vx-item-copy"><strong>{r.full_name}</strong><small>{r.private ? 'Private' : 'Public'}{r.default_branch ? ` · ${r.default_branch}` : ''}</small></span>
                  {done ? <span className="vx-badge ok">Imported</span> : <button type="button" className="secondary vx-small" onClick={() => (hasToken ? importRepo(r) : openVercelImport(r.full_name))} disabled={!!working}>{working === r.full_name ? 'Importing…' : hasToken ? 'Import' : 'Import on Vercel'}</button>}
                </li>
              );
            })}
          </ul>
          {!showAll && !q && matches.length > 5 && <button type="button" className="vx-link" onClick={() => setShowAll(true)}>Show all {matches.length}</button>}
          <p className="vx-hint">Vercel can only import repositories its GitHub app can access. If one is missing, <a href="https://github.com/apps/vercel" target="_blank" rel="noreferrer">install the Vercel GitHub app</a> for that account. If GitHub on Vercel is a different account from the one PotHub uses, use that account there.</p>
        </>}
      </section>

      {createBlocked ? <AccessTokenCard api={api} importUrl={createBlocked} onNotice={onNotice} onSaved={() => { setCreateBlocked(''); setError(''); setHasToken(true); }} /> : reauth ? <ReauthNotice onReauthorize={onReauthorize} /> : error && <div className="vx-notice error" role="alert"><div><p>{error}</p></div></div>}

      {sheet && <ProjectSheet key={sheet.id} project={sheet} api={api} onClose={() => setSheet(null)} onReauthorize={onReauthorize} onNotice={onNotice} onDeployed={(info) => { setSheet(null); onDeployed(info); }} />}
    </div>
  );
}
