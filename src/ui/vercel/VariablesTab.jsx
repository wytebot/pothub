import React from 'react';
import { ExternalLink, Lock, Plus } from 'lucide-react';
import Sheet from './Sheet.jsx';
import EnvEditor from './EnvEditor.jsx';
import ReauthNotice from './ReauthNotice.jsx';
import useEnvDraft from './useEnvDraft.js';
import { envDashboardUrl, needsVercelReauth } from '../../lib/vercel-env.js';

const cap = (t) => t[0].toUpperCase() + t.slice(1);
const AI_ENV_KEYS = {
  GEMINI_API_KEY: { label: 'Google Gemini', provider: 'gemini', model: 'gemini-3.6-flash', functions: ['Chat','Diagnosis','Fix','Image','Video'] },
  GOOGLE_API_KEY: { label: 'Google Gemini', provider: 'gemini', model: 'gemini-3.6-flash', functions: ['Chat','Diagnosis','Fix','Image','Video'] },
  OPENAI_API_KEY: { label: 'OpenAI', provider: 'openai', model: 'gpt-4.1-mini', functions: ['Chat','Diagnosis','Fix','Image'] },
  AZURE_OPENAI_API_KEY: { label: 'Azure OpenAI', provider: 'azure-openai', model: '', functions: ['Chat','Diagnosis','Fix','Image'], requiresEndpoint: true },
  CUSTOM_AI_API_KEY: { label: 'Custom OpenAI-compatible', provider: 'openai-compatible', model: '', functions: ['Chat','Diagnosis','Fix','Image'], requiresEndpoint: true },
  ANTHROPIC_API_KEY: { label: 'Anthropic', provider: 'anthropic', model: 'claude-sonnet-4-5', functions: ['Chat','Diagnosis','Fix'] },
  MISTRAL_API_KEY: { label: 'Mistral', provider: 'mistral', model: 'mistral-small-latest', functions: ['Chat','Diagnosis','Fix'] },
  GROQ_API_KEY: { label: 'Groq', provider: 'groq', model: 'llama-3.3-70b-versatile', functions: ['Chat','Diagnosis','Fix'] },
  DEEPSEEK_API_KEY: { label: 'DeepSeek', provider: 'deepseek', model: 'deepseek-chat', functions: ['Chat','Diagnosis','Fix'] },
  XAI_API_KEY: { label: 'xAI', provider: 'xai', model: 'grok-3-mini', functions: ['Chat','Diagnosis','Fix'] },
  OPENROUTER_API_KEY: { label: 'OpenRouter', provider: 'openrouter', model: 'openai/gpt-4.1-mini', functions: ['Chat','Diagnosis','Fix'] },
  COHERE_API_KEY: { label: 'Cohere', provider: 'cohere', model: 'command-r-plus', functions: ['Chat','Diagnosis','Fix'] },
  PERPLEXITY_API_KEY: { label: 'Perplexity', provider: 'perplexity', model: 'sonar', functions: ['Chat','Diagnosis','Fix'] },
  TOGETHER_API_KEY: { label: 'Together AI', provider: 'together', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', functions: ['Chat','Diagnosis','Fix'] },
  FIREWORKS_API_KEY: { label: 'Fireworks', provider: 'fireworks', model: 'accounts/fireworks/models/llama-v3p3-70b-instruct', functions: ['Chat','Diagnosis','Fix'] },
  HF_TOKEN: { label: 'Hugging Face', provider: 'huggingface', model: 'meta-llama/Llama-3.3-70B-Instruct', functions: ['Chat','Diagnosis','Fix'] },
  HUGGINGFACE_API_KEY: { label: 'Hugging Face', provider: 'huggingface', model: 'meta-llama/Llama-3.3-70B-Instruct', functions: ['Chat','Diagnosis','Fix'] },
  REPLICATE_API_TOKEN: { label: 'Replicate', provider: 'replicate', model: 'black-forest-labs/flux-1.1-pro', functions: ['Image','Video'] },
  STABILITY_API_KEY: { label: 'Stability AI', provider: 'stability', model: 'stable-image-core', functions: ['Image'] },
  FAL_KEY: { label: 'fal.ai', provider: 'fal', model: 'fal-ai/flux-pro/v1.1', functions: ['Image'] },
  BFL_API_KEY: { label: 'Black Forest Labs', provider: 'black-forest-labs', model: 'flux-pro-1.1', functions: ['Image'] },
  RUNWAY_API_SECRET: { label: 'Runway', provider: 'runway', model: 'gen4.5', functions: ['Video'] },
  LUMA_API_KEY: { label: 'Luma', provider: 'luma', model: 'ray-2', functions: ['Video'] },
  KLING_API_KEY: { label: 'Kling', provider: 'kling', model: 'kling-3.0', functions: ['Video'] }
};
const functionForEnv = key => /(?:^|_)(?:IMAGE|IMAGEN)(?:_|$)/.test(key) ? 'Image' : /(?:^|_)VIDEO(?:_|$)/.test(key) ? 'Video' : /(?:^|_)(?:DIAGNOSIS|DEBUG)(?:_|$)/.test(key) ? 'Diagnosis' : /(?:^|_)(?:FIX|REPAIR|CODE)(?:_|$)/.test(key) ? 'Fix' : 'Chat';
const modelForFunction = (meta, fn) => ({ Image: ({gemini:'gemini-3.1-flash-image',openai:'gpt-image-2',replicate:'black-forest-labs/flux-1.1-pro',stability:'stable-image-core',fal:'fal-ai/flux-pro/v1.1','black-forest-labs':'flux-pro-1.1'})[meta.provider] || '', Video: ({replicate:'kwaivgi/kling-v2.1',runway:'gen4.5',luma:'ray-2'})[meta.provider] || '', Chat: meta.model, Diagnosis: meta.model, Fix: meta.model })[fn] ?? meta.model;

/** Variables that exist on the selected project, read from Vercel. Values are never shown. */
export default function VariablesTab({ api, projects, project, onSelect, onReauthorize }) {
  const [vars, setVars] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [reauth, setReauth] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [assignments, setAssignments] = React.useState({});
  const [savingAssignments, setSavingAssignments] = React.useState(false);
  const [success, setSuccess] = React.useState('');
  const draft = useEnvDraft(api);
  const apiRef = React.useRef(api); apiRef.current = api;

  const load = React.useCallback(async () => {
    setLoading(true); setError(''); setReauth(false);
    try { const d = await apiRef.current('/api/vercel/environment-variables'); const next = d.variables || []; setVars(next); setAssignments(old => { const value = { ...old }; for (const row of next) { const meta = AI_ENV_KEYS[row.key]; if (meta && !value[row.key]) value[row.key] = { function: meta.functions.includes(functionForEnv(row.key)) ? functionForEnv(row.key) : meta.functions[0], model: modelForFunction(meta, meta.functions.includes(functionForEnv(row.key)) ? functionForEnv(row.key) : meta.functions[0]), baseUrl: meta.baseUrl || '' }; } for (const item of (d.aiAgentMap || [])) value[item.keyEnv] = { function: item.function, model: item.model, baseUrl: item.baseUrl || '' }; return value; }); }
    catch (e) { setError(String(e?.message || e)); setReauth(needsVercelReauth(e)); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { if (project?.id) load(); else setLoading(false); }, [project?.id, load]);

  function openAdd() { draft.reset(); setAdding(true); }
  function openRotate(variable) {
    draft.replace(variable.key, true);
    setAdding(true);
  }
  async function closeAdd() { setAdding(false); await load(); }
  async function change(p) { try { await onSelect(p); draft.reset(); } catch (e) { setError(String(e?.message || e)); setReauth(needsVercelReauth(e)); } }
  async function saveAssignments() {
    const rows = vars.filter(v => AI_ENV_KEYS[v.key] && assignments[v.key]);
    if (!rows.length) { setError('Add a supported AI provider key to configure function assignments.'); return; }
    const mapping = rows.map(v => ({ function: assignments[v.key].function, provider: AI_ENV_KEYS[v.key].provider, keyEnv: v.key, model: String(assignments[v.key].model || '').trim(), ...(AI_ENV_KEYS[v.key].requiresEndpoint ? { baseUrl: String(assignments[v.key].baseUrl || '').trim() } : {}) }));
    if (mapping.some(x => !x.model || !AI_ENV_KEYS[x.keyEnv].functions.includes(x.function) || (AI_ENV_KEYS[x.keyEnv].requiresEndpoint && !x.baseUrl))) { setError('Choose a supported function and enter a model ID for every assigned provider.'); return; }
    setSavingAssignments(true); setError(''); setReauth(false);
    try { const d = await apiRef.current('/api/vercel/environment-variables', { method: 'POST', body: JSON.stringify({ variables: [{ key: 'POTHUB_AI_AGENT_MAP', value: JSON.stringify(mapping), secret: false }], targets: ['production','preview','development'] }) }); setSuccess(d.note || 'AI function assignments saved. Redeploy the Vercel project to activate them.'); await load(); }
    catch (e) { setError(String(e?.message || e)); setReauth(needsVercelReauth(e)); }
    finally { setSavingAssignments(false); }
  }

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
              <span className="vx-item-copy"><strong>{v.key}</strong><small>{v.targets.map(cap).join(' · ') || 'No environment'}{AI_ENV_KEYS[v.key] ? ` · ${AI_ENV_KEYS[v.key].label} · ${assignments[v.key]?.function || functionForEnv(v.key)}` : ''}</small>{AI_ENV_KEYS[v.key] && <span className="vx-ai-assignment"><select aria-label={`Function for ${v.key}`} value={assignments[v.key]?.function || (AI_ENV_KEYS[v.key].functions.includes(functionForEnv(v.key)) ? functionForEnv(v.key) : AI_ENV_KEYS[v.key].functions[0])} onChange={e => setAssignments(old => ({ ...old, [v.key]: { ...(old[v.key] || {}), function: e.target.value, model: modelForFunction(AI_ENV_KEYS[v.key], e.target.value) } }))}>{AI_ENV_KEYS[v.key].functions.map(fn => <option key={fn} value={fn}>{fn}</option>)}</select><input aria-label={`Model for ${v.key}`} value={assignments[v.key]?.model ?? AI_ENV_KEYS[v.key].model} onChange={e => setAssignments(old => ({ ...old, [v.key]: { ...(old[v.key] || {}), model: e.target.value } }))} placeholder="Exact model ID" />{AI_ENV_KEYS[v.key].requiresEndpoint && <input aria-label={`Endpoint for ${v.key}`} value={assignments[v.key]?.baseUrl || ''} onChange={e => setAssignments(old => ({ ...old, [v.key]: { ...(old[v.key] || {}), baseUrl: e.target.value } }))} placeholder="Public HTTPS API endpoint" />}</span>}</span>
              <span className={`vx-badge ${v.sensitive ? 'lock' : ''}`}>{v.sensitive && <Lock size={12} aria-hidden="true" />}{v.sensitive ? 'Sensitive' : 'Not sensitive'}</span>
              {v.key === 'POTHUB_RUNTIME_PROJECT_ID' ? <span className="vx-hint">Managed by PotHub</span> : <button type="button" className="vx-icon-btn" onClick={() => openRotate(v)} aria-label={`Rotate ${v.key}`} title="Replace value">Edit / rotate</button>}
            </li>
          ))}
        </ul>
        {project && vars.some(v => AI_ENV_KEYS[v.key]) && <div className="vx-ai-map"><button type="button" className="primary vx-deploy" onClick={saveAssignments} disabled={savingAssignments}>{savingAssignments ? 'Saving assignments…' : 'Save AI function assignments'}</button><p className="vx-hint">Choose which PotHub function uses each provider and enter its exact model ID (and a public HTTPS endpoint for custom/Azure providers). This writes the non-secret <code>POTHUB_AI_AGENT_MAP</code> configuration variable. Redeploy the Vercel project after saving.</p>{success && <p className="vx-success" role="status">{success}</p>}</div>}
        {project && <p className="vx-hint">Vercel never returns variable values, so they are not shown. Use Edit / rotate to replace a value without exposing the current secret. Saving an existing name updates it in Vercel; redeploy to activate it. <a href={url} target="_blank" rel="noreferrer">Open this project’s variables in Vercel <ExternalLink size={12} aria-hidden="true" /></a></p>}
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
