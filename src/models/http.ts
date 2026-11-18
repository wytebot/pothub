import { Capacitor, CapacitorHttp } from '@capacitor/core';

export type ProviderErr = Error & { status?: number };
export const perr = (m: string, status?: number): ProviderErr => Object.assign(new Error(m), { status });
export const scrub = (t: string, secret: string) => (secret ? t.split(secret).join('••••') : t);

/** OpenAI and Google allow calls straight from a browser. Every other provider goes through the phone's own network stack on Android, because browsers block most of them. */
const BROWSER_OK = new Set(['api.openai.com', 'generativelanguage.googleapis.com', 'huggingface.co']);
const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return ''; } };
const useNative = (url: string) => Capacitor.isNativePlatform() && !BROWSER_OK.has(hostOf(url));

/** True when a response can be read as it arrives. The phone's own network stack (used for non-browser hosts on Android) returns everything at once. */
export const canStream = (url: string) => !useNative(url);

const bytesOf = (b64: string) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

async function nativeFetch(url: string, init: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
  let data: unknown; let dataType: 'formData' | undefined;
  const b = init.body;
  if (typeof FormData !== 'undefined' && b instanceof FormData) {
    const o: Record<string, string> = {}; b.forEach((v, k) => { if (typeof v === 'string') o[k] = v; });
    data = o; dataType = 'formData'; delete headers['content-type'];
  } else if (typeof b === 'string') {
    data = /json/i.test(headers['content-type'] ?? '') ? JSON.parse(b) : b;
  }
  const r = await CapacitorHttp.request({ url, method: init.method ?? 'GET', headers, data, dataType, responseType: 'blob', connectTimeout: 30_000, readTimeout: 150_000 });
  const raw = typeof r.data === 'string' ? bytesOf(r.data) : new TextEncoder().encode(JSON.stringify(r.data ?? ''));
  const noBody = [101, 204, 205, 304].includes(r.status);
  return new Response(noBody ? null : raw, { status: r.status, headers: r.headers as HeadersInit });
}

export function sniffMime(u: Uint8Array): string {
  if (u[0] === 0x89 && u[1] === 0x50) return 'image/png';
  if (u[0] === 0xff && u[1] === 0xd8) return 'image/jpeg';
  if (u[0] === 0x52 && u[1] === 0x49 && u[8] === 0x57) return 'image/webp';
  return 'image/png';
}
export function blobFromB64(b64: string, mime?: string): Blob {
  const u = bytesOf(b64.includes(',') ? b64.split(',')[1] : b64);
  return new Blob([u as unknown as BlobPart], { type: mime ?? sniffMime(u) });
}
export async function imageFromBlob(b: Blob): Promise<{ blob: Blob; mime: string }> {
  const u = new Uint8Array(await b.slice(0, 16).arrayBuffer());
  const mime = b.type.startsWith('image/') ? b.type : sniffMime(u);
  return { blob: b.type === mime ? b : new Blob([b], { type: mime }), mime };
}

export async function call(url: string, init: RequestInit, secret: string): Promise<Response> {
  try {
    if (useNative(url)) return await nativeFetch(url, init);
    return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(120_000) });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Cancelled.');
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('The provider took too long to respond. Try again.');
    if (!Capacitor.isNativePlatform() && !BROWSER_OK.has(hostOf(url))) throw new Error('Could not reach the provider. If you are online, this provider may not allow requests from a web browser. It works in the Pothub Android app.');
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

export const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('Cancelled.')); }, { once: true });
});

/** Longest edge L, ratio "w:h", both sides rounded to a multiple of `m`. */
export function dims(aspect: string, long = 1024, m = 64): { w: number; h: number } {
  const [a, b] = aspect.split(':').map(Number); const r = a / b;
  const round = (n: number) => Math.max(m, Math.round(n / m) * m);
  return r >= 1 ? { w: round(long), h: round(long / r) } : { w: round(long * r), h: round(long) };
}
