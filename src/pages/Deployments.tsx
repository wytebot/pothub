import { useEffect, useState } from 'react';
import { Select } from '../ui/Select';
import { Icon } from '../ui/Icon';
import { listRepos, loadGithubToken, whoami, type Repo } from '../repo/github';
import { finishVercelSignIn } from '../repo/vercel';
import { GithubTab } from '../repo/GithubTab';
import { VercelTab } from '../repo/VercelTab';
import { ForgeBuildRuns } from '../repo/ForgeBuildRuns';

type Tab = 'github' | 'vercel' | 'forge';
const TAB = 'pothub.deploy.tab'; const SEL = 'pothub.deploy.repo';

/**
 * Deployments: two header menus, GitHub deployment and Vercel deployment. Each shows build steps and build logs;
 * a failed build gets an Analyze button that opens the analysis chat, and then Fix.
 */
export function Deployments() {
  const [token, setToken] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]); const [sel, setSel] = useState(() => localStorage.getItem(SEL) || '');
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem(TAB) === 'vercel' ? 'vercel' : localStorage.getItem(TAB) === 'forge' ? 'forge' : 'github'));
  const [error, setError] = useState(''); const [vcEpoch, setVcEpoch] = useState(0);
  const repo = repos.find((r) => r.full_name === sel) ?? repos[0] ?? null;

  // The GitHub connection is made in Codelab; this page uses it.
  useEffect(() => {
    let live = true;
    (async () => {
      const t = await loadGithubToken(); if (!live) return;
      setToken(t);
      if (!t) return;
      try { await whoami(t); const list = await listRepos(t); if (live) setRepos(list); }
      catch (e) { if (live) setError(e instanceof Error ? e.message : 'GitHub could not be reached.'); }
    })();
    return () => { live = false; };
  }, []);

  // Back from "Sign in with Vercel": the page URL carries a one-time code.
  useEffect(() => {
    const q = new URLSearchParams(location.search); const code = q.get('vercel_code'); const state = q.get('vercel_state'); const denied = q.get('vercel_error');
    if (!code && !denied) return;
    window.history.replaceState(window.history.state, '', location.pathname + location.hash);
    setTab('vercel'); localStorage.setItem(TAB, 'vercel');
    if (denied) { setError(`Vercel authorization was not completed: ${denied}`); return; }
    if (!code || !state) return;
    finishVercelSignIn(code, state).then(() => setVcEpoch((n) => n + 1)).catch((e) => setError(e instanceof Error ? e.message : 'Vercel authorization failed.'));
  }, []);

  const pickTab = (t: Tab) => { setTab(t); localStorage.setItem(TAB, t); };
  const pickRepo = (full: string) => { setSel(full); localStorage.setItem(SEL, full); };

  return (
    <section className="page rp">
      <nav className="rp-tabs" role="tablist" aria-label="Deployment pages">
        <button role="tab" aria-selected={tab === 'github'} className={tab === 'github' ? 'on' : ''} onClick={() => pickTab('github')}>GitHub deployment</button>
        <button role="tab" aria-selected={tab === 'vercel'} className={tab === 'vercel' ? 'on' : ''} onClick={() => pickTab('vercel')}>Vercel deployment</button>
        <button role="tab" aria-selected={tab === 'forge'} className={tab === 'forge' ? 'on' : ''} onClick={() => pickTab('forge')}>Cloud builds</button>
      </nav>
      {token === null && <div className="rp-card"><p className="rp-muted">Loading…</p></div>}
      {token === '' && tab !== 'forge' && (
        <div className="rp-card rp-connect">
          <h2>Connect GitHub</h2>
          <p className="rp-muted">Deployments read your repository and commit fixes with your GitHub connection.</p>
          <a className="btn primary" href="#/codelab"><Icon name="code" size={16} /> Connect in Codelab</a>
          {error && <p className="rp-err" role="alert">{error}</p>}
        </div>
      )}
      {tab==='forge' && <ForgeBuildRuns />}
      {token && tab!=='forge' && (
        <>
          <div className="rp-bar">
            <Select label="Repository" value={repo?.full_name ?? ''} options={repos.map((r) => ({ value: r.full_name, label: r.full_name }))} onChange={pickRepo} className="rp-sel" />
          </div>
          {error && <p className="rp-err" role="alert">{error}{/401|expired|Bad credentials/i.test(error) ? ' Reconnect GitHub in Codelab.' : ''}</p>}
          {tab === 'github' ? <GithubTab token={token} repo={repo} /> : <VercelTab key={vcEpoch} ghToken={token} repo={repo} />}
        </>
      )}
    </section>
  );
}
