import React from 'react';
import { KeyRound, Cpu, Rocket, ScrollText, RefreshCw } from 'lucide-react';
import ImportTab from './vercel/ImportTab.jsx';
import LogsTab from './vercel/LogsTab.jsx';
import VariablesTab from './vercel/VariablesTab.jsx';
import AiBackendTab from './vercel/AiBackendTab.jsx';
import { linkedRepo } from '../lib/vercel-env.js';

const TABS = [
  { id: 'import', label: 'Projects', Icon: Rocket },
  { id: 'logs', label: 'Logs', Icon: ScrollText },
  { id: 'variables', label: 'Variables', Icon: KeyRound },
  { id: 'ai', label: 'AI backend', Icon: Cpu },
];
const TAB_KEY = 'pothub-vercel-tab';
const readTab = () => { try { const t = sessionStorage.getItem(TAB_KEY); return TABS.some((x) => x.id === t) ? t : 'import'; } catch { return 'import'; } };

export default function VercelBackendWorkspace({ api, onReconnect, onConnectGithub, onSwitchGithub, onNotice, onSaved, onFixBuild, locked = false, onUnlock }) {
  const apiRef = React.useRef(api); apiRef.current = api;
  const [tab, setTabState] = React.useState('import');
  const [status, setStatus] = React.useState({ loading: true, connected: false, email: '' });
  const [projects, setProjects] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [error, setError] = React.useState('');
  const [focusId, setFocusId] = React.useState('');

  React.useEffect(() => { setTabState(readTab()); }, []);
  const setTab = React.useCallback((id) => { setTabState(id); try { sessionStorage.setItem(TAB_KEY, id); } catch { /* storage can be blocked */ } }, []);

  const load = React.useCallback(async () => {
    setStatus((s) => ({ ...s, loading: true })); setError('');
    try {
      const st = await apiRef.current('/api/vercel/status');
      if (!st.connected) { setStatus({ loading: false, connected: false, email: '' }); setProjects([]); return; }
      setStatus({ loading: false, connected: true, email: st.email || '' });
      setSelectedId(st.selectedProjectId || '');
      const data = await apiRef.current('/api/vercel/projects');
      setProjects(data.projects || []);
      setSelectedId(data.selectedProjectId || st.selectedProjectId || '');
    } catch (e) { setStatus((s) => ({ ...s, loading: false })); setError(String(e?.message || e)); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const selected = projects.find((p) => p.id === selectedId) || null;

  /** Make this the project every other page (variables, logs, deploy) works on. */
  const selectProject = React.useCallback(async (p) => {
    if (!p) { await apiRef.current('/api/vercel/project', { method: 'POST', body: JSON.stringify({ projectId: '' }) }); setSelectedId(''); return; }
    if (p.id !== selectedId) {
      await apiRef.current('/api/vercel/project', { method: 'POST', body: JSON.stringify({ projectId: p.id, teamId: p.teamId || null }) });
      setSelectedId(p.id);
    }
  }, [selectedId]);

  // One project and none ticked yet: tick it, so the other pages are never empty for no reason.
  const autoPicked = React.useRef(false);
  React.useEffect(() => {
    if (autoPicked.current || selectedId || projects.length !== 1) return;
    autoPicked.current = true;
    selectProject(projects[0]).catch(() => {});
  }, [projects, selectedId, selectProject]);

  const projectAdded = React.useCallback((p) => { setProjects((old) => [p, ...old.filter((x) => x.id !== p.id)]); setSelectedId(p.id); }, []);
  const deployed = React.useCallback((info) => { setFocusId(info.deploymentId || ''); setTab('logs'); }, [setTab]);
  const fix = React.useCallback(({ deploymentId, logs, project }) => {
    const repoFullName = linkedRepo(project);
    if (!repoFullName) { onNotice?.('This Vercel project is not linked to a GitHub repository, so there is no repo chat to send the logs to. Copy the logs instead.'); return; }
    onFixBuild?.({ repoFullName, logs, deploymentId, projectName: project.name });
  }, [onFixBuild, onNotice]);

  if (locked) return <section className="vercel-backend-page vx-page"><div className="vx-card"><h2>Vercel settings are protected</h2><p>Verify your device authenticator or PotHub passcode before changing Vercel or backend credentials.</p><button type="button" className="primary" onClick={onUnlock}>Unlock</button></div></section>;

  const index = Math.max(0, TABS.findIndex((t) => t.id === tab));
  return (
    <section className="vercel-backend-page vx-page">
      <header className="vx-header">
        <div><h1>Vercel</h1><p>{status.connected ? (status.email || 'Account connected') : 'Deploy and manage your projects'}</p></div>
        {status.connected && <button type="button" className="vx-icon-btn" aria-label="Refresh" onClick={load} disabled={status.loading}><RefreshCw size={17} className={status.loading ? 'spin' : ''} /></button>}
      </header>

      {!status.loading && !status.connected && (
        <div className="vx-card vx-connect">
          <h2>Connect your Vercel account</h2>
          <p>PotHub opens Vercel’s own authorization page. If Vercel emails you a verification code, enter it there. PotHub never asks for it.</p>
          <button type="button" className="primary" onClick={onReconnect}>Connect Vercel</button>
          {error && <p className="vx-field-error" role="alert">{error}</p>}
        </div>
      )}

      {status.loading && !status.connected && <div className="vx-skeletons" aria-label="Loading Vercel"><i /><i /><i /></div>}

      {status.connected && <>
        <nav className="vx-tabs" role="tablist" aria-label="Vercel sections" style={{ '--i': index, '--n': TABS.length }}>
          <span className="vx-tab-indicator" aria-hidden="true" />
          {TABS.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" id={`vx-tab-${id}`} aria-selected={tab === id} aria-controls={`vx-panel-${id}`} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon size={16} aria-hidden="true" /><span>{label}</span></button>)}
        </nav>
        {error && <p className="vx-field-error" role="alert">{error}</p>}
        <div className="vx-panel" role="tabpanel" id={`vx-panel-${tab}`} aria-labelledby={`vx-tab-${tab}`} key={tab}>
          {tab === 'import' && <ImportTab api={api} onRefresh={load} projects={projects} selectedId={selectedId} onSelect={selectProject} onDeployed={deployed} onNotice={onNotice} />}
          {tab === 'logs' && <LogsTab api={api} project={selected} focusId={focusId} onFix={fix} />}
          {tab === 'variables' && <VariablesTab api={api} projects={projects} project={selected} onSelect={selectProject} onReauthorize={onReconnect} />}
          {tab === 'ai' && <AiBackendTab api={api} project={selected} onReauthorize={onReconnect} onNotice={onNotice} onSaved={onSaved} />}
        </div>
      </>}
    </section>
  );
}
