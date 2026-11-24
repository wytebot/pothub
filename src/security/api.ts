import { guestId, idToken } from '../auth/session';

export interface ServerProfile {
  uid: string; email: string | null; role: 'user' | 'admin'; plan: string | null;
  entitled: boolean; currentPeriodEnd: string | null;
  usage: { image: number; video: number; day: string };
  limits: { image: number; video: number } | null;
}

const SITE_ORIGIN = 'https://pothub-self.vercel.app';
/** Website-tool and GitHub functions live in this site's own /api folder on Vercel. Relative on the web, absolute in the Android app. */
const webBase = (() => { try { return location.protocol.startsWith('http') && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : SITE_ORIGIN; } catch { return SITE_ORIGIN; } })();

/** `open`: the call also works without a Pothub account (guests), so a missing sign-in is not an error. */
async function call<T>(base: string, path: string, body: unknown, timeoutMs: number, where: string, open = false): Promise<T> {
  const token = await idToken();
  if (!token && !open) throw new Error('Sign in with Google to use this. Your sign-in has ended or was never started.');
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : { 'X-Pothub-Guest': guestId() }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error(`Could not reach ${where}. Check your connection and try again.`);
  }
  // A web page where data was expected means the request landed on the website instead of the service.
  if (!/json/i.test(response.headers.get('content-type') ?? '')) {
    throw new Error(base === ''
      ? `${where} is not deployed on this site (${path} returned a web page). Redeploy the latest version so the api folder is included.`
      : `${where} answered with a web page instead of data (${path}). The API request must use this site's Vercel deployment.`);
  }
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? (response.status === 401 || response.status === 403 ? 'Not allowed. Reload Pothub, or sign in with Google, and try again.' : `Pothub could not complete this request (HTTP ${response.status}).`));
  return data;
}

/** All application API calls use same-origin Vercel serverless functions. */
export async function request<T>(path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
  return call<T>(webBase, path, body, timeoutMs, 'Pothub Vercel API');
}

/** Calls the serverless functions that ship with this site (GitHub sign-in, website verification and diagnosis). */
export const requestSite = <T>(path: string, body?: unknown, timeoutMs = 15_000) => call<T>(webBase, path, body, timeoutMs, 'The Pothub website service', true);

export const getServerProfile = () => request<ServerProfile>('/api/account/me');

/** Authenticated Software Doctor API call. GitHub credentials are sent only for this request and are never persisted by the Pothub server. */
export async function requestDoctor<T>(path: string, githubToken: string, body?: unknown): Promise<T> {
  const token = await idToken();
  if (!token) throw new Error('Sign in with Google before using Software Doctor.');
  const response = await fetch(`${webBase}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Token': githubToken, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Software Doctor request failed (${response.status}).`);
  return data;
}
