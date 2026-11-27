import { Capacitor } from '@capacitor/core';
import { GoogleAuthProvider, signInWithRedirect } from 'firebase/auth';
import { auth } from '../firebase';

/** Google Drive's hidden per-app folder: only MonyGist can see it, it counts against the person's own Drive space, and it is not shown in their Drive. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SK = 'cloud.tok.v1';
export const TOKEN_EVENT = 'cloud:token';
const env = import.meta.env as Record<string, string | undefined>;
const CLIENT_ID = env.VITE_GOOGLE_CLIENT_ID ?? '';

interface Tok { token: string; exp: number; }
let mem: Tok | null = null;
const load = (): Tok | null => {
  if (mem) return mem;
  try { const t = JSON.parse(sessionStorage.getItem(SK) ?? 'null') as Tok | null; if (t && typeof t.token === 'string') mem = t; } catch { /* unreadable */ }
  return mem;
};
const save = (t: Tok | null) => { mem = t; try { if (t) sessionStorage.setItem(SK, JSON.stringify(t)); else sessionStorage.removeItem(SK); } catch { /* storage blocked */ } };
export const clearToken = () => save(null);
export const cachedToken = (): string | null => { const t = load(); return t && t.exp - Date.now() > 60_000 ? t.token : null; };

export type Accepted = 'ok' | 'wrong-account' | 'no-scope' | 'invalid';
/** Checks with Google who a token belongs to, what it allows and when it ends, then remembers it. */
export async function acceptToken(token: string | null | undefined, expectEmail: string): Promise<Accepted> {
  if (!token) return 'invalid';
  let secs = 3000;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (r.status === 400) return 'invalid';
    if (r.ok) {
      const j = await r.json() as { email?: string; scope?: string; expires_in?: string };
      if (j.scope && !j.scope.split(' ').includes(DRIVE_SCOPE)) return 'no-scope';
      if (j.email && expectEmail && j.email.toLowerCase() !== expectEmail.toLowerCase()) return 'wrong-account';
      const n = Number(j.expires_in); if (Number.isFinite(n) && n > 0) secs = n;
    }
  } catch { /* offline: trust it for a short while; Drive itself will refuse a bad token */ secs = 1800; }
  save({ token, exp: Date.now() + secs * 1000 });
  return 'ok';
}

/** Called right after sign-in (browser redirect or Android picker) with the access token Google handed back. */
export async function captureFromSignIn(accessToken: string | undefined | null, email: string) {
  if (await acceptToken(accessToken, email) === 'ok') window.dispatchEvent(new Event(TOKEN_EVENT));
}

const emailOfIdToken = (jwt: string | undefined): string => {
  try { const p = JSON.parse(atob((jwt ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { email?: string }; return p.email ?? ''; } catch { return ''; }
};

// ---- optional: renew the token quietly in the browser (needs VITE_GOOGLE_CLIENT_ID, the same web client Firebase uses for Google sign-in)
type Gis = { accounts: { oauth2: { initTokenClient: (c: Record<string, unknown>) => { requestAccessToken: (o: { prompt: string }) => void } } } };
const gis = () => (window as unknown as { google?: Gis }).google;
function loadGis(): Promise<void> {
  if (gis()?.accounts?.oauth2) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error('gis')); document.head.appendChild(s); });
}
async function gisToken(email: string, interactive: boolean): Promise<string | null> {
  try {
    await loadGis(); const g = gis(); if (!g) return null;
    return await new Promise<string | null>((resolve) => {
      const c = g.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: `${DRIVE_SCOPE} email`, hint: email, callback: (r: { access_token?: string; error?: string }) => resolve(r.access_token && !r.error ? r.access_token : null), error_callback: () => resolve(null) });
      c.requestAccessToken({ prompt: interactive ? '' : 'none' });
    });
  } catch { return null; }
}

/** A usable token without bothering the person: the saved one, or (browser with a client id) a quiet renewal. */
export async function getToken(email: string): Promise<string | null> {
  const t = cachedToken(); if (t) return t;
  if (!Capacitor.isNativePlatform() && CLIENT_ID) { const g = await gisToken(email, false); if (g && await acceptToken(g, email) === 'ok') return cachedToken(); }
  return null;
}

export type Connected = 'ok' | 'redirect' | Exclude<Accepted, 'ok'> | 'cancelled';
/** Asks Google (with a tap from the person) for access to the MonyGist folder in their Drive. */
export async function connectDrive(email: string): Promise<Connected> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const r = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true, scopes: [DRIVE_SCOPE] });
      const who = emailOfIdToken(r.credential?.idToken);
      if (who && email && who.toLowerCase() !== email.toLowerCase()) return 'wrong-account';
      return await acceptToken(r.credential?.accessToken, email);
    }
    if (CLIENT_ID) { const g = await gisToken(email, true); return g ? await acceptToken(g, email) : 'cancelled'; }
    const p = new GoogleAuthProvider(); p.addScope(DRIVE_SCOPE); p.setCustomParameters({ login_hint: email });
    sessionStorage.setItem('auth.redirectPending', '1');
    await signInWithRedirect(auth, p);
    return 'redirect';
  } catch { return 'cancelled'; }
}
