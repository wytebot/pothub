import { idToken } from '../auth/session';

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
export interface ServerProfile {
  uid: string; email: string | null; role: 'user' | 'admin'; plan: string | null;
  entitled: boolean; currentPeriodEnd: string | null;
  usage: { image: number; video: number; day: string };
  limits: { image: number; video: number } | null;
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  if (!API) throw new Error('The secure Pothub service is not configured. Contact the app administrator.');
  const token = await idToken();
  if (!token) throw new Error('Your sign-in session has expired. Sign in again to continue.');
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Could not reach Pothub security service. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? (response.status === 401 ? 'Sign in again to continue.' : 'Pothub could not authorize this request.'));
  return data;
}

export const getServerProfile = () => request<ServerProfile>('/api/account/me');
/** Counts an attempt atomically on the server before any provider request is made. */
export async function reserveUsage(kind: 'image' | 'video', amount = 1) {
  const result = await request<{ allowed: true; used: number; limit: number | null; remaining: number | null; premium: boolean }>('/api/usage/reserve', { kind, amount });
  // Keep only a display cache in sync; the server remains the authority.
  try {
    const key = `quota.${new Date().toISOString().slice(0, 10)}`;
    const cached = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>;
    cached[kind] = result.used;
    localStorage.setItem(key, JSON.stringify(cached));
  } catch { /* storage is optional; the server reservation already succeeded */ }
  return result;
}
