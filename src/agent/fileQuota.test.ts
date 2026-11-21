import { describe, expect, it, vi } from 'vitest';
vi.mock('../security/api', () => ({ request: vi.fn() }));
import { request } from '../security/api';
import { consumeFileQuota, getFileQuota, FILE_ANALYSIS_LIMIT } from './fileQuota';
const mocked = vi.mocked(request);
describe('server-authoritative file quota client', () => {
  it('uses the server status and parses the reset timestamp', async () => {
    mocked.mockResolvedValueOnce({ premium: false, used: 4, limit: 20, remaining: 16, resetAt: '2026-11-21T10:00:00.000Z' } as never);
    const q = await getFileQuota(); expect(q.remaining).toBe(16); expect(q.resetAt).toBe(Date.parse('2026-11-21T10:00:00.000Z'));
  });
  it('premium is represented as unlimited, not a local capped counter', async () => {
    mocked.mockResolvedValueOnce({ premium: true, used: 0, limit: null, remaining: null, resetAt: null } as never);
    const q = await getFileQuota(); expect(q.premium).toBe(true); expect(q.remaining).toBe(null); expect(q.limit).toBe(null);
  });
  it('reserves the requested count on the server', async () => {
    mocked.mockResolvedValueOnce({ premium: false, used: 5, limit: FILE_ANALYSIS_LIMIT, remaining: 15, resetAt: null } as never);
    const q = await consumeFileQuota(5); expect(mocked).toHaveBeenCalledWith('/api/files/quota/consume', { count: 5 }); expect(q.used).toBe(5);
  });
});
