import React from 'react';
import { Copy, ExternalLink, Rocket } from 'lucide-react';
import Sheet from './Sheet.jsx';
import EnvEditor from './EnvEditor.jsx';
import ReauthNotice from './ReauthNotice.jsx';
import useEnvDraft from './useEnvDraft.js';
import { assignedDomain, envDashboardUrl, needsVercelReauth } from '../../lib/vercel-env.js';

/** The card that opens when a project is picked: its Vercel domain, variables to add, and Deploy. */
export default function ProjectSheet({ project, api, onClose, onDeployed, onReauthorize, onNotice }) {
  const draft = useEnvDraft(api);
  const [stage, setStage] = React.useState('');
  const [error, setError] = React.useState('');
  const [reauth, setReauth] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const dashboardUrl = envDashboardUrl(project);
  const { domain, confirmed } = assignedDomain(project);
  const busy = !!stage || draft.busy;

  async function deploy() {
    setError(''); setReauth(false);
    try {
      if (draft.pending > 0) {
        setStage('saving');
        const r = await draft.save();
        if (!r.ok) { setStage(''); return; }
      }
      setStage('deploying');
      const d = await api('/api/vercel/redeploy', { method: 'POST', body: JSON.stringify({ target: 'production' }), timeoutMs: 40000, noRetry: true });
      onNotice?.('Deployment started. Follow it in Logs.');
      onDeployed?.({ deploymentId: d.deploymentId, url: d.url, inspectUrl: d.inspectUrl, project });
    } catch (e) {
      setError(String(e?.message || e || 'The deployment could not be started.'));
      setReauth(needsVercelReauth(e));
    } finally { setStage(''); }
  }

  async function copyDomain() {
    try { await navigator.clipboard.writeText(`https://${domain}`); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard can be blocked */ }
  }

  return (
    <Sheet open onClose={onClose} busy={busy} title={project.name} subtitle={project.framework || 'Vercel project'}
      footer={<button type="button" className="primary vx-deploy" onClick={deploy} disabled={busy}><Rocket size={17} aria-hidden="true" /> {stage === 'saving' ? 'Saving variables…' : stage === 'deploying' ? 'Starting deployment…' : 'Deploy'}</button>}>
      <div className="vx-domain">
        <span className="vx-label">Vercel domain</span>
        <div className="vx-domain-row">
          <strong>{domain || 'Assigned after the first deployment'}</strong>
          {domain && <>
            <button type="button" className="vx-icon-btn" aria-label="Copy domain" onClick={copyDomain}><Copy size={16} /></button>
            <a className="vx-icon-btn" href={`https://${domain}`} target="_blank" rel="noreferrer" aria-label="Open domain"><ExternalLink size={16} /></a>
          </>}
        </div>
        {copied ? <small className="vx-ok">Copied</small> : !confirmed && domain && <small>Vercel’s default address. It is confirmed after the first deployment.</small>}
      </div>

      <EnvEditor draft={draft} dashboardUrl={dashboardUrl} onReauthorize={onReauthorize} />

      {reauth ? <ReauthNotice onReauthorize={onReauthorize} /> : error && <p className="vx-field-error" role="alert">{error}</p>}
    </Sheet>
  );
}
