let runtimeAgentConfig = null;
let runtimeUseAgent = false;
let runtimeAgentUnlocked = false;

// Provider credentials deliberately exist only in JS memory. They are never persisted to Web Storage.
export function configureRuntimeAgent(keys, enabled) {
  runtimeAgentConfig = Array.isArray(keys) ? { keys: keys.map(k => ({ ...k })) } : null;
  runtimeUseAgent = Boolean(enabled);
}
export function setRuntimeAgentUnlocked(unlocked) { runtimeAgentUnlocked = Boolean(unlocked); }
export function clearRuntimeAgent() { runtimeAgentConfig = null; runtimeUseAgent = false; runtimeAgentUnlocked = false; }

// Single source of truth for the API prefix. Web uses same-origin /api (served by the
// Vite proxy in dev and by Vercel functions in production). The Android APK and any
// separately hosted UI set an absolute base URL; the API routes always live under /api.
export function apiBase() {
  let base = '';
  try {
    base = import.meta.env.VITE_API_BASE_URL
      || localStorage.getItem('pothub_api_base')
      || localStorage.getItem('kithub_api_base')
      || '';
  } catch { base = ''; }
  return `${String(base).trim().replace(/\/$/, '')}/api`;
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const taskPath = String(path || '');
  if (runtimeUseAgent && localStorageSafe('pothub_secret_mode') && !runtimeAgentUnlocked) {
    throw new Error('Secret mode is locked. Unlock the API environment before using your provider keys.');
  }
  const taskKind = taskPath.includes('/diagnose') ? 'diagnosis'
    : taskPath.includes('/agent/edit-project') ? 'repair'
    : taskPath.includes('/repair/') ? 'repair'
    : taskPath.includes('/files/') ? 'file'
    : taskPath.includes('/creator/image') ? 'image'
    : taskPath.includes('/creator/video') ? 'video'
    : taskPath.includes('/creator/text') ? 'text' : 'workflow';
  const workspace = taskPath.includes('/creator/') ? 'creator' : 'developer';
  headers['X-Pothub-Task-Kind'] = taskKind;
  headers['X-Pothub-Workspace'] = workspace;
  if (runtimeUseAgent && (!localStorageSafe('pothub_secret_mode') || runtimeAgentUnlocked)) headers['X-Pothub-Use-Agent'] = 'true';

  // Do not put provider keys in HTTP headers: proxies and request diagnostics are more
  // likely to record headers. Attach them only to the body of a POST operation that
  // actually needs them. The API must never persist or log this transient payload.
  let body = options.body;
  if (body && typeof body !== 'string' && String(options.method || 'GET').toUpperCase() !== 'GET') {
    body = { ...body };
    if (!taskPath.includes('/agent/test') && runtimeUseAgent && (!localStorageSafe('pothub_secret_mode') || runtimeAgentUnlocked) && runtimeAgentConfig) body.agentConfig = runtimeAgentConfig;
  }
  if (window.Capacitor?.isNativePlatform?.()) {
    const token = localStorage.getItem('pothub_native_session') || localStorage.getItem('kithub_native_session');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${apiBase()}${path}`, {
    credentials: 'include', ...options, headers,
    body: body && typeof body !== 'string' ? JSON.stringify(body) : body
  });
  const data = await res.json().catch(() => ({ error: 'Unreadable server response.' }));
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}
function localStorageSafe(key) {
  try { return localStorage.getItem(key) === 'true'; } catch { return false; }
}
export function redact(t=''){return String(t).replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g,'[REDACTED_GITHUB_TOKEN]').replace(/AIza[0-9A-Za-z_-]{30,}/g,'[REDACTED_GOOGLE_KEY]').replace(/(Bearer\s+)[A-Za-z0-9._-]{20,}/gi,'$1[REDACTED]').replace(/((?:password|secret|token|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]')}
