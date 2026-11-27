import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { isOnline, waitOnline } from './online';
import { viaGateway } from './gateway';
import { GatewayError, parseRef } from './gatewayRef';

export type ProviderErr = Error & { status?: number };
export const perr = (m: string, status?: number): ProviderErr => Object.assign(new Error(m), { status });
export const scrub = (t: string, secret: string) => (secret ? t.split(secret).join('••••') : t);

/** OpenAI and Google allow calls straight from a browser. Every other provider goes through the phone's own network stack on Android, because browsers block most of them. */
const BROWSER_OK = new Set(['api.openai.com', 'generativelanguage.googleapis.com', 'huggingface.co', 'api.anthropic.com', 'openrouter.ai', 'api.groq.com']);
const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return ''; } };
const useNative = (url: string) => Capacitor.isNativePlatform() && !BROWSER_OK.has(hostOf(url));

/** True when a response can be read as it arrives. The phone's own network stack (used for non-browser hosts on Android) returns everything at once. */
export const canStream = (url: string) => !useNative(url);

const bytesOf = (b64: string) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
async function nativeFetch(url: string, init: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {}; new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
  let data: unknown; let dataType: 'formData' | undefined; const b = init.body;
  if (typeof FormData !== 'undefined' && b instanceof FormData) { const o: Record<string, string> = {}; b.forEach((v, k) => { if (typeof v === 'string') o[k] = v; }); data = o; dataType = 'formData'; delete headers['content-type']; }
  else if (typeof b === 'string') data = /json/i.test(headers['content-type'] ?? '') ? JSON.parse(b) : b;
  const r = await CapacitorHttp.request({ url, method: init.method ?? 'GET', headers, data, dataType, responseType: 'blob', connectTimeout: 30_000, readTimeout: 150_000 });
  const raw = typeof r.data === 'string' ? bytesOf(r.data) : new TextEncoder().encode(JSON.stringify(r.data ?? '')); const noBody = [101, 204, 205, 304].includes(r.status);
  return new Response(noBody ? null : raw, { status: r.status, headers: r.headers as HeadersInit });
}

export async function call(url: string, init: RequestInit, secret: string): Promise<Response> {
  // A backend key is only a reference: the request goes to the MonyGist backend, which holds the real key.
  const ref = parseRef(secret);
  // Offline: wait for the connection (the person can still cancel), then send. If the connection drops during the request, send it again once it is back.
  for (;;) {
    await waitOnline(init.signal ?? undefined);
    try {
      if (ref) return await viaGateway(url, init, ref);
      if (useNative(url)) return await nativeFetch(url, init);
      return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(120_000) });
    } catch (e) {
      if (e instanceof GatewayError) throw e;
      const stopped = e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError');
      if (!stopped && !isOnline()) continue;
      if (ref && !stopped) throw new GatewayError('Could not reach your backend. Check your connection and that the backend is online.');
      return fail(e, url, secret);
    }
  }
}

function fail(e: unknown, url: string, secret: string): never {
  {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Cancelled.');
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('The provider took too long to respond. Try again.');
    if (!Capacitor.isNativePlatform() && !BROWSER_OK.has(hostOf(url))) throw new Error('Could not reach the provider. If you are online, this provider may not allow requests from a web browser. It works in the MonyGist Android app.');
    throw new Error(scrub('Could not reach the provider. Check your connection and try again.', secret));
  }
}

export async function failure(r: Response, secret: string): Promise<ProviderErr> {
  let detail = '';
  try {
    const j = await r.clone().json() as Record<string, unknown>;
    const e = j.error as { message?: unknown } | string | undefined;
    detail = scrub(String((typeof e === 'string' ? e : e?.message) ?? j.message ?? j.detail ?? ''), secret).slice(0, 220);
  } catch { /* not JSON */ }
  if (r.status === 401 || r.status === 403) return perr('The provider rejected this key. Check that it is correct, active and allowed to use this model.', r.status);
  if (r.status === 402) return perr('Your provider account has no credit left. Add credit with the provider, then try again.', r.status);
  if (r.status === 429) return perr('Rate limit or quota reached on your provider account. Wait a moment or check your plan and billing.', r.status);
  if (r.status >= 500) return perr('The provider is having problems right now. Try again shortly.', r.status);
  return perr(detail || `The provider returned an error (${r.status}).`, r.status);
}

