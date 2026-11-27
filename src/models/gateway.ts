import { idToken } from '../auth/session';
import { agentApi, GatewayError, type GatewayRef, type VarNames } from './gatewayRef';

const tooLarge = 'This request is too large for the backend (about 4 MB). Send fewer or smaller files.';
const notFound = 'No MonyGist backend was found at this address. Check the address, and that the backend has the api/agent folder and has been redeployed.';

/** Sends one provider request through the backend, which adds the key from its environment. The key never reaches this device. */
export async function viaGateway(url: string, init: RequestInit, ref: GatewayRef): Promise<Response> {
  const token = await idToken();
  if (!token) throw new GatewayError('Your sign-in session has expired. Sign in again to use your backend.', 401);
  const method = (init.method ?? 'GET').toUpperCase();
  let body: unknown;
  if (typeof init.body === 'string' && init.body) { try { body = JSON.parse(init.body); } catch { throw new GatewayError('This request cannot be sent through the backend.', 400); } }
  const r = await fetch(`${agentApi(ref.g)}/proxy`, {
    method: 'POST', cache: 'no-store', signal: init.signal ?? AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method, body, ...(ref.v ? { vars: ref.v } : {}) }),
  });
  if (r.headers.get('x-pothub-gateway')) { const j = await r.json().catch(() => ({})) as { error?: string }; throw new GatewayError(j.error ?? 'The backend refused this request.', r.status); }
  if (r.status === 413) throw new GatewayError(tooLarge, 413);
  if (r.status === 404 && /html/i.test(r.headers.get('content-type') ?? '')) throw new GatewayError(notFound, 404);
  return r;
}

export interface BackendInfo { provider: string; model: string; models?: string[]; ready: boolean; missing: string[] }
/** What the backend at `base` is set up to use (provider and model names only, never the key). */
export async function fetchInfo(base: string, vars?: VarNames, signal?: AbortSignal): Promise<BackendInfo> {
  const token = await idToken();
  if (!token) throw new GatewayError('Sign in to connect a backend.', 401);
  let r: Response;
  const qs = new URLSearchParams(); if (vars?.provider) qs.set('provider_var', vars.provider); if (vars?.key) qs.set('key_var', vars.key); if (vars?.model) qs.set('model_var', vars.model); if (vars?.allowedEmails) qs.set('emails_var', vars.allowedEmails);
  const query = qs.toString();
  try { r = await fetch(`${agentApi(base)}/info${query ? `?${query}` : ''}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: signal ?? AbortSignal.timeout(15_000) }); }
  catch { throw new GatewayError('Could not reach that address. Check it, and that the backend is deployed and online.'); }
  const j = await r.json().catch(() => null) as (Partial<BackendInfo> & { error?: string }) | null;
  if (!j) throw new GatewayError(notFound, r.status);
  if (!r.ok) throw new GatewayError(j.error ?? 'The backend refused the connection.', r.status);
  return { provider: String(j.provider ?? ''), model: String(j.model ?? ''), models: Array.isArray((j as any).models) ? (j as any).models.map(String).filter(Boolean) : undefined, ready: j.ready === true, missing: Array.isArray(j.missing) ? j.missing.map(String) : [] };
}
