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
  const normalized = String(base).trim().replace(/\/$/, '');
  // Accept either an origin (https://api.example.com) or an origin already
  // ending in /api; never generate the broken /api/api path.
  return normalized ? (/\/api$/i.test(normalized) ? normalized : `${normalized}/api`) : '/api';
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const taskPath = String(path || '');
  if (runtimeUseAgent && localStorageSafe('pothub_secret_mode') && !runtimeAgentUnlocked) {
    const e = new Error('Secret mode is locked. Unlock the API environment before using your provider keys.');
    e.code = 'POTHUB_SECRET_MODE_LOCKED'; e.endpoint = taskPath; throw e;
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
  const requestId = globalThis.crypto?.randomUUID?.() || `ph-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  headers['X-Pothub-Request-Id'] = requestId;
  if (runtimeUseAgent && (!localStorageSafe('pothub_secret_mode') || runtimeAgentUnlocked)) headers['X-Pothub-Use-Agent'] = 'true';

  let body = options.body;
  if (body && typeof body !== 'string' && String(options.method || 'GET').toUpperCase() !== 'GET') {
    body = { ...body };
    if (!taskPath.includes('/agent/test') && runtimeUseAgent && (!localStorageSafe('pothub_secret_mode') || runtimeAgentUnlocked) && runtimeAgentConfig) body.agentConfig = runtimeAgentConfig;
  }
  if (window.Capacitor?.isNativePlatform?.()) {
    const token = localStorage.getItem('pothub_native_session') || localStorage.getItem('kithub_native_session');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const controller = new AbortController();
  const externalSignal = options.signal;
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 45000);
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
  }
  const requestOptions = { ...options };
  delete requestOptions.timeoutMs;
  delete requestOptions.signal;
  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      credentials: 'include', ...requestOptions, headers, signal: controller.signal,
      body: body && typeof body !== 'string' ? JSON.stringify(body) : body
    });
  } catch (cause) {
    const timedOut = controller.signal.aborted && (cause?.name === 'TimeoutError' || !externalSignal?.aborted);
    const error = new Error(timedOut
      ? `Request timed out after ${Math.round(timeoutMs / 1000)} seconds. Check the API deployment and retry.`
      : (navigator.onLine === false ? 'You appear to be offline. Reconnect and retry.' : 'Could not reach the Pothub API. Check your connection, API URL, CORS settings, and deployment status.'));
    error.name = 'PothubNetworkError'; error.code = timedOut ? 'POTHUB_REQUEST_TIMEOUT' : 'POTHUB_NETWORK_ERROR';
    error.requestId = requestId; error.endpoint = taskPath; error.method = String(options.method || 'GET').toUpperCase(); error.causeMessage = redact(cause?.message || 'Network request failed');
    throw error;
  } finally { clearTimeout(timer); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.error || data?.message || `Request failed with HTTP ${res.status}.`);
    error.name = 'PothubApiError'; error.code = data?.code || `HTTP_${res.status}`; error.status = res.status;
    error.requestId = data?.requestId || res.headers.get('x-request-id') || requestId;
    error.endpoint = taskPath; error.method = String(options.method || 'GET').toUpperCase();
    error.details = data?.details || null; error.timestamp = new Date().toISOString();
    throw error;
  }
  if (data === null) {
    const error = new Error('The API returned a response that was not valid JSON. Check the server logs for this request.');
    error.name = 'PothubResponseError'; error.code = 'POTHUB_INVALID_JSON'; error.status = res.status;
    error.requestId = res.headers.get('x-request-id') || requestId; error.endpoint = taskPath; error.method = String(options.method || 'GET').toUpperCase();
    throw error;
  }
  return data;
}
function localStorageSafe(key) {
  try { return localStorage.getItem(key) === 'true'; } catch { return false; }
}
export function redact(t=''){return String(t).replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g,'[REDACTED_GITHUB_TOKEN]').replace(/AIza[0-9A-Za-z_-]{30,}/g,'[REDACTED_GOOGLE_KEY]').replace(/(Bearer\s+)[A-Za-z0-9._-]{20,}/gi,'$1[REDACTED]').replace(/((?:password|secret|token|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]')}
