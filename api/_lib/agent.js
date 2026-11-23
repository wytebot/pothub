// Backend gateway, one provider + one model per backend. Variable names can be customized by the backend operator.
// Clients receive only the variable names and configuration status, never secret values.

const P = {
  openai: { chat: 'https://api.openai.com/v1/chat/completions', models: 'https://api.openai.com/v1/models' },
  gemini: { host: 'https://generativelanguage.googleapis.com' },
  xai: { chat: 'https://api.x.ai/v1/chat/completions', models: 'https://api.x.ai/v1/models' },
  anthropic: { chat: 'https://api.anthropic.com/v1/messages', models: 'https://api.anthropic.com/v1/models' },
  deepseek: { chat: 'https://api.deepseek.com/chat/completions', models: 'https://api.deepseek.com/models' },
  mistral: { chat: 'https://api.mistral.ai/v1/chat/completions', models: 'https://api.mistral.ai/v1/models' },
  groq: { chat: 'https://api.groq.com/openai/v1/chat/completions', models: 'https://api.groq.com/openai/v1/models' },
  openrouter: { chat: 'https://openrouter.ai/api/v1/chat/completions', models: 'https://openrouter.ai/api/v1/models' },
  together: { chat: 'https://api.together.xyz/v1/chat/completions', models: 'https://api.together.xyz/v1/models' },
};
export const PROVIDER_IDS = Object.keys(P);
export const DEFAULT_VARIABLES = { provider: 'POTHUB_PROVIDER', key: 'POTHUB_API_KEY', model: 'POTHUB_MODEL', allowedEmails: 'POTHUB_ALLOWED_EMAILS' };
export const VARIABLE_NAME_SETTINGS = { provider: 'POTHUB_PROVIDER_ENV', key: 'POTHUB_API_KEY_ENV', model: 'POTHUB_MODEL_ENV', allowedEmails: 'POTHUB_ALLOWED_EMAILS_ENV' };
const clean = (v) => String(v ?? '').trim();
const safeEnvName = (v, fallback) => /^[A-Z][A-Z0-9_]{1,63}$/.test(clean(v)) ? clean(v) : fallback;
// Names the person typed in the app. Only plain, upper-case names are accepted, and anything that looks like a platform or login secret is refused.
const SYSTEM_NAME = /^(?:VERCEL|AWS|GITHUB|FIREBASE|GOOGLE|NODE|NPM|PATH|HOME|SITE_VERIFY|APP_ORIGIN|EXTRA_ORIGINS|FLW|SECRET)(?:_|$)/;
export function customNames(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const field of Object.keys(DEFAULT_VARIABLES)) { const v = clean(raw[field]).toUpperCase(); if (/^[A-Z][A-Z0-9_]{1,63}$/.test(v) && !SYSTEM_NAME.test(v)) out[field] = v; }
  return out;
}
/** Which environment variables hold the provider, key, model and allowed emails: the names sent by the app, else the operator's own settings, else the defaults. */
export function variableNames(env = process.env, custom = {}) { return Object.fromEntries(Object.entries(DEFAULT_VARIABLES).map(([field, fallback]) => [field, custom[field] || safeEnvName(env[VARIABLE_NAME_SETTINGS[field]], fallback)])); }
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/;
/** Model env values may contain an ordered comma-separated fallback chain. */
export function modelList(value) { return clean(value).split(',').map(x => x.trim()).filter(Boolean).filter(x => MODEL.test(x)); }

/** What this backend is set up to do, with the names of anything missing. Never includes the key. */
export function settings(env = process.env, custom = {}) {
  const names = variableNames(env, custom);
  const provider = clean(env[names.provider]).toLowerCase(); const key = clean(env[names.key]); const model = clean(env[names.model]);
  const missing = [];
  if (!provider) missing.push(names.provider); else if (!PROVIDER_IDS.includes(provider)) missing.push(`${names.provider} (use one of: ${PROVIDER_IDS.join(', ')})`);
  if (!key) missing.push(names.key);
  if (!model) missing.push(names.model); else if (!modelList(model).length || modelList(model).length !== model.split(',').map(x => x.trim()).filter(Boolean).length) missing.push(`${names.model} (use valid model IDs separated by commas)`);
  if (!clean(env[names.allowedEmails])) missing.push(names.allowedEmails);
  return { provider, key, model, models: modelList(model), missing, ready: missing.length === 0, variableNames: names };
}

/** Only accounts whose verified Google email is in the allowed-emails variable may use this backend. Closed if the list is empty. */
export function accessFor(who, env = process.env, custom = {}) {
  const names = variableNames(env, custom);
  const emails = clean(env[names.allowedEmails]).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return { ok: false, status: 503, error: `This backend is not finished. Add ${names.allowedEmails} (your Google email) to its environment variables, then redeploy.` };
  if (who.emailVerified && who.email && emails.includes(who.email.toLowerCase())) return { ok: true };
  return { ok: false, status: 403, error: `Your account is not allowed on this backend. Add your Google email to ${names.allowedEmails} and redeploy.` };
}

/** Request headers that carry the key. */
export function authHeaders(provider, secret) {
  if (provider === 'gemini') return { 'x-goog-api-key': secret };
  if (provider === 'anthropic') return { 'x-api-key': secret, 'anthropic-version': '2023-06-01' };
  return { Authorization: `Bearer ${secret}` };
}

const GEMINI_ACTION = /^\/v1beta\/models\/[A-Za-z0-9._-]+:(generateContent|streamGenerateContent)$/;
const PARAMS = new Set(['alt', 'pageSize', 'pageToken', 'limit']);

/** The exact provider address to call, or null if the app asked for anything that is not a chat or model-list request.
 *  For Gemini the model sits in the address, so it is replaced by POTHUB_MODEL here. */
export function targetFor(provider, rawUrl, method, model) {
  const cfg = P[provider]; let u; try { u = new URL(String(rawUrl)); } catch { return null; }
  if (!cfg || u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const m = String(method).toUpperCase(); let at = `${u.origin}${u.pathname}`; let ok = false;
  if (provider === 'gemini') {
    if (u.origin !== cfg.host) return null;
    if (m === 'GET' && u.pathname === '/v1beta/models') ok = true;
    else if (m === 'POST' && GEMINI_ACTION.test(u.pathname)) { ok = true; at = `${cfg.host}/v1beta/models/${model}:${u.pathname.endsWith('streamGenerateContent') ? 'streamGenerateContent' : 'generateContent'}`; }
  } else ok = (m === 'POST' && at === cfg.chat) || (m === 'GET' && at === cfg.models);
  if (!ok) return null;
  const out = new URL(at); for (const [k, v] of u.searchParams) if (PARAMS.has(k)) out.searchParams.set(k, v);
  return out.toString();
}

/** Chat bodies for every provider except Gemini carry the model name; the backend's own model always wins. */
export function withModel(provider, body, model) {
  if (provider === 'gemini' || !body || typeof body !== 'object' || Array.isArray(body)) return body ?? {};
  return { ...body, model };
}
