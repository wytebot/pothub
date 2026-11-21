/**
 * A backend connection is never a secret in this app. It is a reference: which provider, which backend address and which
 * model the backend is set to use. The reference travels where a key string would, so the chat code is unchanged, and the
 * network layer recognises it and sends the request to the backend instead of straight to the provider.
 */
export interface GatewayRef { p: string; g: string; m?: string }
const PREFIX = 'pothub-backend:';

export const encodeRef = (r: GatewayRef): string => PREFIX + btoa(JSON.stringify(r));
export const isGatewayRef = (s: string): boolean => typeof s === 'string' && s.startsWith(PREFIX);
export function parseRef(s: string): GatewayRef | null {
  if (!isGatewayRef(s)) return null;
  try { const j = JSON.parse(atob(s.slice(PREFIX.length))) as Partial<GatewayRef>; return typeof j.p === 'string' && typeof j.g === 'string' ? { p: j.p, g: j.g, ...(typeof j.m === 'string' ? { m: j.m } : {}) } : null; } catch { return null; }
}

/** A problem reported by the backend itself (not by the AI provider): sign-in, access, setup or size. */
export class GatewayError extends Error {
  readonly gateway = true;
  constructor(message: string, readonly status?: number) { super(message); }
}

/** The variables a person sets on their own backend. Pothub only needs the address afterwards. */
export const BACKEND_VARIABLES = [
  { name: 'POTHUB_PROVIDER', note: 'openai, gemini, anthropic, xai, deepseek, mistral, groq, openrouter or together' },
  { name: 'POTHUB_API_KEY', note: 'your API key from that provider' },
  { name: 'POTHUB_MODEL', note: 'the model to use, for example gpt-4o' },
  { name: 'POTHUB_ALLOWED_EMAILS', note: 'the Google email you sign in to Pothub with' },
] as const;

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
