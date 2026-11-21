import { request } from '../security/api';
export const FILE_ANALYSIS_LIMIT = 20;
export const FILE_ANALYSIS_WINDOW_MS = 5 * 60 * 60 * 1000;
export type FileQuota = { premium: boolean; used: number; limit: number | null; resetAt: number | null; remaining: number | null };
type ServerQuota = { premium: boolean; used: number; limit: number | null; remaining: number | null; resetAt: string | null; windowMs?: number };
const fromServer = (q: ServerQuota): FileQuota => ({ premium: q.premium, used: q.used, limit: q.limit, remaining: q.remaining, resetAt: q.resetAt ? Date.parse(q.resetAt) : null });
export async function getFileQuota(): Promise<FileQuota> { return fromServer(await request<ServerQuota>('/api/files/quota')); }
export async function consumeFileQuota(count: number): Promise<FileQuota> { return fromServer(await request<ServerQuota>('/api/files/quota/consume', { count })); }
export function formatQuotaReset(resetAt: number, locale?: string): string { return new Date(resetAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }); }
export function quotaWait(resetAt: number, now = Date.now()): string { const ms = Math.max(0, resetAt - now); const hours = Math.floor(ms / 3_600_000); const minutes = Math.ceil((ms % 3_600_000) / 60_000); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
