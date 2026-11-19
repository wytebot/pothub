import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
});
vi.stubGlobal('window', { dispatchEvent: () => true });

import { attachStatus, consume, ATTACH_LIMIT, ATTACH_WINDOW_MS } from './attachments';
import { analysisStatus, consumeAnalysis, ANALYSIS_LIMIT, ANALYSIS_WINDOW_MS } from './analysis';

describe('Free and Premium file allowances', () => {
  beforeEach(() => { store.clear(); });

  it('allows exactly 10 distinct attachments for Free, then resets after 5 hours', () => {
    const start = 1_800_000_000_000;
    expect(ATTACH_LIMIT).toBe(10);
    expect(ATTACH_WINDOW_MS).toBe(5 * 60 * 60 * 1000);
    expect(consume(Array.from({ length: 10 }, (_, i) => `file-${i}`), start)).toBe(true);
    expect(attachStatus(start).left).toBe(0);
    expect(consume(['file-11'], start + 1)).toBe(false);
    expect(attachStatus(start + ATTACH_WINDOW_MS).left).toBe(10);
  });

  it('does not charge the same attachment twice when a request is edited or resent', () => {
    const start = 1_800_000_000_000;
    expect(consume(['same-file'], start)).toBe(true);
    expect(consume(['same-file'], start + 1)).toBe(true);
    expect(attachStatus(start + 1).used).toBe(1);
  });

  it('allows 10 completed file-analysis requests for Free, then resets after 5 hours', () => {
    const start = 1_800_000_000_000;
    expect(ANALYSIS_LIMIT).toBe(10);
    expect(ANALYSIS_WINDOW_MS).toBe(5 * 60 * 60 * 1000);
    for (let i = 0; i < 10; i++) consumeAnalysis(start + i);
    expect(analysisStatus(start + 10).left).toBe(0);
    expect(analysisStatus(start + ANALYSIS_WINDOW_MS).left).toBe(10);
  });

  it('keeps both allowances unlimited for Premium', async () => {
    store.set('billing.entitledUntil', String(Date.now() + 60_000));
    const { attachStatus: premiumAttachStatus, consume: premiumConsume } = await import('./attachments');
    const { analysisStatus: premiumAnalysisStatus, consumeAnalysis: premiumConsumeAnalysis } = await import('./analysis');
    expect(premiumAttachStatus().unlimited).toBe(true);
    expect(premiumConsume(Array.from({ length: 100 }, (_, i) => `premium-${i}`))).toBe(true);
    expect(premiumAnalysisStatus().unlimited).toBe(true);
    expect(() => premiumConsumeAnalysis()).not.toThrow();
  });
});
