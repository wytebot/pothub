// Client for the Vercel bridge (api/vercel/*). The Vercel token lives only on this device.
import { Capacitor } from '@capacitor/core';
import { requestSite } from '../security/api';
import type { LogLine } from './buildLog';

export interface VcProject { id: string; name: string; team: string; framework: string; repo: string }
export interface VcDeployment { id: string; url: string; state: string; target: string; created: number; ready: number; sha: string; message: string; branch: string; repo: string }

const KEY = 'pothub.vercel.token';
const PKCE = 'pothub.vercel.pkce';

/** What is kept on the device: the access token, and for a Vercel sign-in also its refresh token and expiry. A pasted token has neither. */
export interface VcSession { access: string; refresh?: string; exp?: number; oauth?: boolean }

async function readRaw(): Promise<string> {
  try {
    if (Capacitor.isNativePlatform()) { const { SecureStorage } = await import('@aparajita/capacitor-secure-storage'); const v = await SecureStorage.get(KEY); return typeof v === 'string' ? v : ''; }
    return localStorage.getItem(KEY) || '';
  } catch { return ''; }
}
async function writeRaw(v: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) { const { SecureStorage } = await import('@aparajita/capacitor-secure-storage'); if (v) await SecureStorage.set(KEY, v); else await SecureStorage.remove(KEY); }
    else if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY);
  } catch { if (v) throw new Error('Could not save the Vercel sign-in on this device.'); }
}
export async function loadVercelSession(): Promise<VcSession | null> {
  const raw = await readRaw(); if (!raw) return null;
  if (!raw.startsWith('{')) return { access: raw };            // a token pasted by the person (older versions stored just the text)
  try { const j = JSON.parse(raw) as VcSession; return typeof j.access === 'string' && j.access ? j : null; } catch { return null; }
}
export const saveVercelSession = (s: VcSession) => writeRaw(JSON.stringify(s));
export const saveVercelToken = (token: string) => saveVercelSession({ access: token });
export const clearVercelToken = () => writeRaw('');

/** A usable access token: a Vercel sign-in lasts one hour, so it is renewed with its refresh token a minute before it ends. */
export async function loadVercelToken(): Promise<string> {
  const s = await loadVercelSession(); if (!s) return '';
  if (!s.oauth || !s.exp || s.exp - Date.now() > 60_000) return s.access;
  if (!s.refresh) return s.exp > Date.now() ? s.access : '';
  try {
    const r = await requestSite<TokenReply>('/api/auth/vercel/refresh', { refresh_token: s.refresh });
    const next = sessionOf(r); await saveVercelSession(next); return next.access;
  } catch { await clearVercelToken(); return ''; }
}

interface TokenReply { access_token: string; refresh_token?: string; expires_in?: number }
const sessionOf = (r: TokenReply): VcSession => ({ access: r.access_token, refresh: r.refresh_token || undefined, exp: Date.now() + (r.expires_in || 3600) * 1000, oauth: true });

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** Starts "Sign in with Vercel": makes a PKCE verifier (kept in this tab only), asks the server for the authorize link, and goes there. */
export async function startVercelSignIn(): Promise<void> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const r = await requestSite<{ authUrl: string }>(`/api/auth/vercel/start?challenge=${encodeURIComponent(challenge)}`);
  let ok = false; let state = '';
  try { const u = new URL(r.authUrl); ok = u.protocol === 'https:' && u.hostname === 'vercel.com' && u.pathname === '/oauth/authorize'; state = u.searchParams.get('state') || ''; } catch { ok = false; }
  if (!ok) throw new Error('Vercel sign-in could not be started. The MonyGist server did not send a valid Vercel link; check its Vercel App settings and redeploy it.');
  try { sessionStorage.setItem(PKCE, JSON.stringify({ verifier, state })); } catch { throw new Error('This browser blocks the storage Vercel sign-in needs. Allow site storage and try again.'); }
  location.href = r.authUrl;
}
/** Finishes the sign-in when Vercel sends the person back with a code. */
export async function finishVercelSignIn(code: string, state: string): Promise<void> {
  let saved: { verifier?: string; state?: string } = {};
  try { saved = JSON.parse(sessionStorage.getItem(PKCE) || '{}'); sessionStorage.removeItem(PKCE); } catch { /* ignore */ }
  if (!saved.verifier || saved.state !== state) throw new Error('This Vercel sign-in did not start from this browser tab, so it was ignored. Tap Connect Vercel to try again.');
  const r = await requestSite<TokenReply>('/api/auth/vercel/exchange', { code, state, verifier: saved.verifier });
  if (!r.access_token) throw new Error('Vercel did not return an access token.');
  await saveVercelSession(sessionOf(r));
}
/** Signs out: the token is revoked at Vercel when it came from the sign-in, then forgotten on this device. */
export async function signOutVercel(): Promise<void> {
  const s = await loadVercelSession();
  if (s?.oauth) { try { await requestSite('/api/auth/vercel/revoke', { token: s.access }); } catch { /* the token still expires within the hour */ } }
  await clearVercelToken();
}

export const vcProjects = (token: string) => requestSite<{ projects: VcProject[] }>('/api/vercel/projects', { token }).then((r) => r.projects);
export const vcDeployments = (token: string, p: VcProject) => requestSite<{ deployments: VcDeployment[] }>('/api/vercel/deployments', { token, projectId: p.id, team: p.team }).then((r) => r.deployments);
export const vcEvents = (token: string, p: VcProject, deploymentId: string) => requestSite<{ lines: LogLine[] }>('/api/vercel/events', { token, team: p.team, deploymentId }, 40_000).then((r) => r.lines);

export const isFailed = (state: string) => /^(error|failed|canceled|cancelled)$/i.test(state);
export const isBuilding = (state: string) => /^(building|queued|initializing|deploying)$/i.test(state);

const SAFE_VARIABLE = /^[A-Z_][A-Z0-9_]{0,63}$/i;
const SENSITIVE_VARIABLE = /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|AUTH|CERT|COOKIE)/i;
/** Writes only non-sensitive Vercel project environment variables. Access tokens remain on-device and are sent directly to Vercel. */
export async function setVercelProjectVariable(token: string, projectId: string, teamId: string, name: string, value: string, targets: ('production'|'preview'|'development')[] = ['production','preview','development']): Promise<void> {
  if (!SAFE_VARIABLE.test(name) || SENSITIVE_VARIABLE.test(name)) throw new Error('Variable name is invalid or appears sensitive. Use Vercel Environment Variables UI for secrets.');
  if (!projectId || value.length > 5000 || !targets.length) throw new Error('Invalid Vercel variable request.');
  await requestSite<{ saved: boolean }>('/api/vercel/variables', { token, projectId, team: teamId, name, value, targets });
}
