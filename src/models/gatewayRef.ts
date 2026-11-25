/**
 * A backend connection is never a secret in this app. It is a reference: which provider, which backend address and which
 * model the backend is set to use. The reference travels where a key string would, so the chat code is unchanged, and the
 * network layer recognises it and sends the request to the backend instead of straight to the provider.
 */
/** The names of the environment variables on the person's own backend that hold each setting. The person chooses them. */
export interface VarNames { provider?: string; key?: string; model?: string; allowedEmails?: string }
export const VAR_FIELDS = ['provider', 'key', 'model', 'allowedEmails'] as const;
export interface GatewayRef { p: string; g: string; m?: string; v?: VarNames }
const PREFIX = 'pothub-backend:';

export const encodeRef = (r: GatewayRef): string => PREFIX + btoa(JSON.stringify(r));
export const isGatewayRef = (s: string): boolean => typeof s === 'string' && s.startsWith(PREFIX);
const VAR_OK = /^[A-Z][A-Z0-9_]{1,63}$/;
/** '' when the name is usable, else what is wrong with it. Empty is fine (the backend's own setting is used). */
export function varNameProblem(raw: string): string {
  const v = raw.trim(); if (!v) return '';
  return VAR_OK.test(v.toUpperCase()) ? '' : 'Use letters, numbers and underscores only, starting with a letter (for example MY_API_KEY).';
}
/** Keeps only valid names, upper-cased. Undefined when none were given. */
export function pickVars(o: unknown): VarNames | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const out: VarNames = {};
  for (const f of VAR_FIELDS) { const v = (o as Record<string, unknown>)[f]; if (typeof v === 'string' && VAR_OK.test(v.trim().toUpperCase())) out[f] = v.trim().toUpperCase(); }
  return Object.keys(out).length ? out : undefined;
}
export const sameVars = (a?: VarNames, b?: VarNames) => VAR_FIELDS.every((f) => (a?.[f] ?? '') === (b?.[f] ?? ''));
export function parseRef(s: string): GatewayRef | null {
  if (!isGatewayRef(s)) return null;
  try { const j = JSON.parse(atob(s.slice(PREFIX.length))) as Partial<GatewayRef>; const v = pickVars(j.v); return typeof j.p === 'string' && typeof j.g === 'string' ? { p: j.p, g: j.g, ...(typeof j.m === 'string' ? { m: j.m } : {}), ...(v ? { v } : {}) } : null; } catch { return null; }
}

/** A problem reported by the backend itself (not by the AI provider): sign-in, access, setup or size. */
export class GatewayError extends Error {
  readonly gateway = true;
  constructor(message: string, readonly status?: number) { super(message); }
}

/** Turns what a person pastes into the backend's base address, or says what is wrong with it. */
export function backendUrl(input: string): string {
  const raw = input.trim();
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw new Error('That does not look like a web address. Paste your backend address, for example https://my-backend.vercel.app'); }
  const local = u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
  if (u.protocol !== 'https:' && !local) throw new Error('The backend address must start with https://');
  if (u.username || u.password) throw new Error('Leave passwords out of the backend address.');
  return `${u.origin}${u.pathname.replace(/\/+$/, '').replace(/\/api\/agent(\/.*)?$/, '')}`;
}
export const agentApi = (base: string): string => `${base}/api/agent`;
