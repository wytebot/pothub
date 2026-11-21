import { idToken } from '../auth/session';

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
export interface ServerProfile {
  uid: string; email: string | null; role: 'user' | 'admin'; plan: string | null;
  entitled: boolean; currentPeriodEnd: string | null;
  usage: { image: number; video: number; day: string };
  limits: { image: number; video: number } | null;
}

const SITE_ORIGIN = 'https://pothub-self.vercel.app';
/** Website-tool and GitHub functions live in this site's own /api folder on Vercel. Relative on the web, absolute in the Android app. */
const webBase = (() => { try { return location.protocol.startsWith('http') && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : SITE_ORIGIN; } catch { return SITE_ORIGIN; } })();

async function call<T>(base: string, path: string, body: unknown, timeoutMs: number, where: string): Promise<T> {
  const token = await idToken();
  if (!token) throw new Error('Your sign-in session has expired. Sign in again to continue.');
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
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
      : `${where} answered with a web page instead of data (${path}). VITE_API_URL must be the address of the Pothub API server, not the website.`);
  }
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? (response.status === 401 || response.status === 403 ? 'Sign in again to continue.' : `Pothub could not complete this request (HTTP ${response.status}).`));
  return data;
}

/** Calls the Pothub API server (search, crawl, background jobs, billing). */
export async function request<T>(path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
  if (!API) throw new Error('The secure Pothub service is not configured. Contact the app administrator.');
  return call<T>(API, path, body, timeoutMs, 'The Pothub API server');
}

/** Calls the serverless functions that ship with this site (GitHub sign-in, website verification and diagnosis). */
export const requestSite = <T>(path: string, body?: unknown, timeoutMs = 15_000) => call<T>(webBase, path, body, timeoutMs, 'The Pothub website service');

export const getServerProfile = () => request<ServerProfile>('/api/account/me');
