import React from 'react';
import { Check, Github, RefreshCw, Search } from 'lucide-react';
import ProjectSheet from './ProjectSheet.jsx';
import ReauthNotice from './ReauthNotice.jsx';
import { assignedDomain, githubStatusFrom, linkedRepo, needsVercelReauth } from '../../lib/vercel-env.js';

export default function ImportTab({ api, projects, selectedId, onSelect, onProjectAdded, onConnectGithub, onSwitchGithub, onReauthorize, onDeployed, onNotice }) {
  const [sheet, setSheet] = React.useState(null);
  const [gh, setGh] = React.useState('checking');
  const [repos, setRepos] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [showAll, setShowAll] = React.useState(false);
  const [working, setWorking] = React.useState('');
  const [error, setError] = React.useState('');
  const [reauth, setReauth] = React.useState(false);
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

  async function pick(project) {
    setError(''); setReauth(false); setWorking(project.id);
    try { await onSelect(project); setSheet(project); }
    catch (e) { setError(String(e?.message || e)); setReauth(needsVercelReauth(e)); }
    finally { setWorking(''); }
  }

  async function importRepo(repo) {
    setError(''); setReauth(false); setWorking(repo.full_name);
    try {
      const d = await api('/api/vercel/import-github', { method: 'POST', body: JSON.stringify({ repoFullName: repo.full_name }), timeoutMs: 40000, noRetry: true });
      const project = { ...d.project, name: d.project.name, domains: d.project.domains || [] };
      onProjectAdded(project);
      setSheet(project);
    } catch (e) { setError(String(e?.message || e)); setReauth(needsVercelReauth(e)); }
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
        {projects.length === 0 && <p className="vx-empty">No Vercel projects yet. Import a GitHub repository below to create one.</p>}
        <ul className="vx-list">
          {projects.map((p) => (
            <li key={`${p.id}:${p.teamId || ''}`}>
              <button type="button" className={`vx-item${selectedId === p.id ? ' active' : ''}`} onClick={() => pick(p)} disabled={!!working}>
                <span className="vx-avatar" aria-hidden="true">▲</span>
                <span className="vx-item-copy"><strong>{p.name}</strong><small>{p.framework || 'Vercel project'} · {assignedDomain(p).domain}</small></span>
                {working === p.id ? <span className="vx-spinner" aria-label="Opening" /> : selectedId === p.id ? <Check size={18} aria-label="Selected" /> : null}
              </button>
            </li>
          ))}
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
                  {done ? <span className="vx-badge ok">Imported</span> : <button type="button" className="secondary vx-small" onClick={() => importRepo(r)} disabled={!!working}>{working === r.full_name ? 'Importing…' : 'Import'}</button>}
                </li>
              );
            })}
          </ul>
          {!showAll && !q && matches.length > 5 && <button type="button" className="vx-link" onClick={() => setShowAll(true)}>Show all {matches.length}</button>}
          <p className="vx-hint">Vercel can only import repositories its GitHub app can access. If one is missing, <a href="https://github.com/apps/vercel" target="_blank" rel="noreferrer">install the Vercel GitHub app</a> for that account. If GitHub on Vercel is a different account from the one PotHub uses, use that account there.</p>
        </>}
      </section>

      {reauth ? <ReauthNotice onReauthorize={onReauthorize} /> : error && <div className="vx-notice error" role="alert"><div><p>{error}</p></div></div>}

      {sheet && <ProjectSheet key={sheet.id} project={sheet} api={api} onClose={() => setSheet(null)} onReauthorize={onReauthorize} onNotice={onNotice} onDeployed={(info) => { setSheet(null); onDeployed(info); }} />}
    </div>
  );
}
