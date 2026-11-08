import React from 'react';
import { ExternalLink, Lock, Plus } from 'lucide-react';
import Sheet from './Sheet.jsx';
import EnvEditor from './EnvEditor.jsx';
import ReauthNotice from './ReauthNotice.jsx';
import useEnvDraft from './useEnvDraft.js';
import { envDashboardUrl, needsVercelReauth } from '../../lib/vercel-env.js';

const cap = (t) => t[0].toUpperCase() + t.slice(1);

/** Variables that exist on the selected project, read from Vercel. Values are never shown. */
export default function VariablesTab({ api, projects, project, onSelect, onReauthorize }) {
  const [vars, setVars] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [reauth, setReauth] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const draft = useEnvDraft(api);
  const apiRef = React.useRef(api); apiRef.current = api;

  const load = React.useCallback(async () => {
    setLoading(true); setError(''); setReauth(false);
    try { const d = await apiRef.current('/api/vercel/environment-variables'); setVars(d.variables || []); }
    catch (e) { setError(String(e?.message || e)); setReauth(needsVercelReauth(e)); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { if (project?.id) load(); else setLoading(false); }, [project?.id, load]);

  function openAdd() { draft.reset(); setAdding(true); }
  async function closeAdd() { setAdding(false); await load(); }
  async function change(p) { try { await onSelect(p); draft.reset(); } catch (e) { setError(String(e?.message || e)); setReauth(needsVercelReauth(e)); } }

  if (!projects.length) return <section className="vx-card"><p className="vx-empty">Import a project first. Its environment variables are managed here.</p></section>;
  const url = envDashboardUrl(project);

  return (
    <div className="vx-stack">
      <div className="vx-chips" role="tablist" aria-label="Project">
        {projects.map((p) => <button type="button" role="tab" aria-selected={project?.id === p.id} key={`${p.id}:${p.teamId || ''}`} className={`vx-pill${project?.id === p.id ? ' on' : ''}`} onClick={() => change(p)}>{p.name}</button>)}
      </div>

      <section className="vx-card">
        <header className="vx-card-head">
          <h2>{project ? `${project.name} variables` : 'Variables'}</h2>
          <button type="button" className="vx-icon-btn solid" aria-label="Add variables" onClick={openAdd} disabled={!project}><Plus size={18} /></button>
        </header>
        {!project && <p className="vx-empty">Choose a project above to see its variables.</p>}
        {project && loading && <div className="vx-skeletons"><i /><i /><i /></div>}
        {project && !loading && !error && vars.length === 0 && <p className="vx-empty">No variables on this project yet. Tap + to add one.</p>}
        <ul className="vx-list">
          {vars.map((v) => (
            <li key={v.id || v.key} className="vx-var">
              <span className="vx-item-copy"><strong>{v.key}</strong><small>{v.targets.map(cap).join(' · ') || 'No environment'}</small></span>
              <span className={`vx-badge ${v.sensitive ? 'lock' : ''}`}>{v.sensitive && <Lock size={12} aria-hidden="true" />}{v.sensitive ? 'Sensitive' : 'Not sensitive'}</span>
            </li>
          ))}
        </ul>
        {project && <p className="vx-hint">Vercel never returns variable values, so they are not shown. <a href={url} target="_blank" rel="noreferrer">Open this project’s variables in Vercel <ExternalLink size={12} aria-hidden="true" /></a></p>}
        {reauth ? <ReauthNotice onReauthorize={onReauthorize} /> : error && <p className="vx-field-error" role="alert">{error}</p>}
      </section>

      {adding && project && (
        <Sheet open onClose={closeAdd} busy={draft.busy} title="Add variables" subtitle={project.name}
          footer={<button type="button" className="primary vx-deploy" onClick={closeAdd} disabled={draft.busy}>Done</button>}>
          <EnvEditor draft={draft} dashboardUrl={url} onReauthorize={onReauthorize} />
          <p className="vx-hint">New values apply to the next deployment.</p>
        </Sheet>
      )}
    </div>
  );
}
