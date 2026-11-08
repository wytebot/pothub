import { providerById, normalizeProvider, modelsForFunction, normalizeConfiguredModel } from '../src/lib/provider-registry.js';

const KEY_ENV_BY_PROVIDER = Object.freeze({
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], openai: ['OPENAI_API_KEY'], anthropic: ['ANTHROPIC_API_KEY'],
  mistral: ['MISTRAL_API_KEY'], groq: ['GROQ_API_KEY'], deepseek: ['DEEPSEEK_API_KEY'], xai: ['XAI_API_KEY'],
  cohere: ['COHERE_API_KEY'], perplexity: ['PERPLEXITY_API_KEY'], together: ['TOGETHER_API_KEY'],
  fireworks: ['FIREWORKS_API_KEY'], openrouter: ['OPENROUTER_API_KEY'], huggingface: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'],
  stability: ['STABILITY_API_KEY'], replicate: ['REPLICATE_API_TOKEN'], fal: ['FAL_KEY'],
  'black-forest-labs': ['BFL_API_KEY'], runway: ['RUNWAY_API_SECRET'], luma: ['LUMA_API_KEY'], kling: ['KLING_API_KEY'], 'azure-openai': ['AZURE_OPENAI_API_KEY']
});
const TASKS = Object.freeze({ Chat: 'chat', Diagnosis: 'diagnosis', Fix: 'repair', Image: 'image', Video: 'video' });
const CAPABILITY = Object.freeze({ chat: 'text', diagnosis: 'text', repair: 'text', image: 'image', video: 'video' });
const clean = value => String(value ?? '').trim();
const reservedKeyPrefix = /^(?:POTHUB|FIREBASE|GOOGLE_APPLICATION|GITHUB|VERCEL|FLUTTERWAVE|AWS|DATABASE|CRON|SESSION|JWT|STRIPE|SMTP|MAIL)_/i;
const allowedKeyName = (provider, name) => (KEY_ENV_BY_PROVIDER[provider] || []).includes(name) || (['openai-compatible','anthropic-compatible'].includes(provider) && /^[A-Z][A-Z0-9_]{0,80}_(?:API_KEY|API_TOKEN|API_SECRET)$/.test(name) && !reservedKeyPrefix.test(name));
const envName = value => /^[A-Z_][A-Z0-9_]{0,127}$/.test(clean(value));
const parseMap = raw => { try { const value = JSON.parse(String(raw || '[]')); return Array.isArray(value) ? value.slice(0, 60) : []; } catch { return []; } };

/**
 * Build provider candidates from server runtime environment variables. Secrets never leave this
 * module/server. Explicit POTHUB_AI_AGENT_MAP rows take precedence over name-based discovery.
 * Supported row: {function, provider, keyEnv, modelEnv?, model?, models?, baseUrl?}.
 */
export function discoverRuntimeAgentCandidates(task, env = process.env) {
  const wanted = String(task || 'chat').toLowerCase();
  const mapped = [];
  const add = row => {
    const provider = normalizeProvider(row.provider);
    const meta = provider && providerById(provider);
    const fn = String(row.function || row.task || 'Chat').trim().toLowerCase();
    const normalizedTask = TASKS[Object.keys(TASKS).find(k => k.toLowerCase() === fn)] || ({ chat: 'chat', diagnosis: 'diagnosis', fix: 'repair', repair: 'repair', image: 'image', video: 'video' })[fn];
    if (!meta || !normalizedTask || (normalizedTask !== wanted && !(wanted === 'repair' && normalizedTask === 'repair'))) return;
    const capability = CAPABILITY[normalizedTask];
    if (!capability || !meta.capabilities?.includes(capability)) return;
    const keyEnv = clean(row.keyEnv);
    if (!envName(keyEnv) || !allowedKeyName(provider, keyEnv)) return;
    const key = clean(env[keyEnv]);
    if (!key || /[\r\n\t\s]/.test(key) || key.length > 4096) return;
    const baseUrl = clean(row.baseUrl || meta.baseUrl || '');
    if (meta.requiresCustomEndpoint && !baseUrl) return;
    const modelEnv = clean(row.modelEnv || '');
    const modelFromEnv = envName(modelEnv) ? clean(env[modelEnv]) : '';
    const fallbackEnv = clean(row.fallbackEnv || env.POTHUB_AI_FALLBACK_ENV || '');
    const fallbackModels = envName(fallbackEnv) ? clean(env[fallbackEnv]).split(/[\n,]/).map(x => x.trim()).filter(Boolean) : [];
    const modelList = [...new Set([...(Array.isArray(row.models) ? row.models : []), row.model, modelFromEnv, ...fallbackModels].map(x => normalizeConfiguredModel(provider, x)).filter(Boolean))].slice(0, 8);
    const functionName = normalizedTask === 'repair' ? 'Fix' : normalizedTask[0].toUpperCase() + normalizedTask.slice(1);
    const mediaTask = normalizedTask === 'image' || normalizedTask === 'video';
    if (mediaTask && meta.capabilities?.includes('text') && !meta.modelsByFunction?.[functionName] && !modelList.length) return;
    const models = modelList.length ? modelList : modelsForFunction(provider, functionName);
    if (!models.length) return;
    mapped.push({ key, model: models[0], models, provider, baseUrl, task: normalizedTask, source: 'user', agentId: `runtime-env:${keyEnv}:${normalizedTask}`, default: row.default !== false, keyEnv, ...(modelEnv ? { modelEnv } : {}), ...(fallbackEnv ? { fallbackEnv } : {}) });
  };

  const hasExplicitMap = Object.prototype.hasOwnProperty.call(env, 'POTHUB_AI_AGENT_MAP') && clean(env.POTHUB_AI_AGENT_MAP) !== '';
  const explicitRows = parseMap(env.POTHUB_AI_AGENT_MAP);
  for (const row of explicitRows) add(row);
  // An explicit map is authoritative, including an intentional empty or malformed map (fail closed).
  if (hasExplicitMap) return mapped.slice(0, 16);

  // Legacy single-backend contract: pointers are exact environment-variable names.
  const pointedKey = clean(env.POTHUB_AI_KEY_ENV);
  const pointedModelEnv = clean(env.POTHUB_AI_MODEL_ENV);
  if (envName(pointedKey) && clean(env[pointedKey])) {
    const provider = Object.keys(KEY_ENV_BY_PROVIDER).find(id => KEY_ENV_BY_PROVIDER[id].includes(pointedKey));
    if (provider) add({ function: wanted === 'repair' ? 'Fix' : wanted[0]?.toUpperCase() + wanted.slice(1), provider, keyEnv: pointedKey, modelEnv: pointedModelEnv, model: envName(pointedModelEnv) ? env[pointedModelEnv] : '' });
    if (mapped.length) return mapped.slice(0, 16);
  }

  // Conventional provider names are discovered only for capabilities the provider actually supports.
  for (const [provider, names] of Object.entries(KEY_ENV_BY_PROVIDER)) {
    const keyEnv = names.find(name => clean(env[name]));
    if (!keyEnv) continue;
    const meta = providerById(provider);
    if (!meta) continue;
    const suffix = keyEnv.replace(/_API_KEY$|_API_SECRET$|_API_TOKEN$|_TOKEN$|_KEY$/, '');
    const modelEnv = [ `${suffix}_MODEL`, `${suffix}_${wanted.toUpperCase()}_MODEL`, `${provider.toUpperCase().replace(/-/g, '_')}_MODEL`, 'POTHUB_AI_MODEL' ].find(name => envName(name) && clean(env[name]));
    const functionName = wanted === 'repair' ? 'Fix' : wanted[0]?.toUpperCase() + wanted.slice(1);
    add({ function: functionName, provider, keyEnv, modelEnv, model: modelEnv ? env[modelEnv] : '' });
  }
  return mapped.slice(0, 16);
}

/** Public, non-secret summary for the Manage Variables / backend-mode UI. */
export function runtimeAgentAvailability(env = process.env) {
  return ['chat', 'diagnosis', 'repair', 'image', 'video'].map(task => ({ task, providers: [...new Set(discoverRuntimeAgentCandidates(task, env).map(x => x.provider))] }));
}
