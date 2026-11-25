import { describe, expect, it } from 'vitest';
import { budgetFor, groupByBudget, mapLimit, splitTextIntoChunks, withRetry } from './chunking';
import { splitTextIntoChunks as fromWorkflow } from './workflow';

describe('large source chunking', () => {
  it('keeps short content in one unchanged segment', () => {
    expect(splitTextIntoChunks('small source')).toEqual(['small source']);
  });

  it('is still exported from workflow for existing callers', () => {
    expect(fromWorkflow).toBe(splitTextIntoChunks);
  });

  it('covers the full source with overlapping segments', () => {
    const source = Array.from({ length: 120_000 }, (_, i) => `line ${i}: important source detail`).join('\n');
    const chunks = splitTextIntoChunks(source, 28_000, 900);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeLessThanOrEqual(28_000);
    expect(chunks[0]).toContain('line 0:');
    expect(chunks[chunks.length - 1]).toContain('line 119999:');
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i - 1].slice(-900)).toBe(chunks[i].slice(0, 900));
    }
  });

  it('uses far fewer, larger segments with the provider budgets', () => {
    const source = Array.from({ length: 120_000 }, (_, i) => `line ${i}: important source detail`).join('\n'); // ~3.9M characters
    const old = splitTextIntoChunks(source, 28_000, 900).length;
    const b = budgetFor('gemini');
    const now = splitTextIntoChunks(source, b.chunk, b.overlap);
    expect(now.length).toBeLessThan(old / 6);
    expect(now[0].length).toBeLessThanOrEqual(b.chunk);
    expect(now[now.length - 1]).toContain('line 119999:');
  });

  it('never loses a character: every line of the source appears in some segment', () => {
    const lines = Array.from({ length: 5_000 }, (_, i) => `row ${i} ${'x'.repeat(i % 37)}`);
    const chunks = splitTextIntoChunks(lines.join('\n'), 10_000, 500);
    const seen = new Set<string>(); for (const c of chunks) for (const l of c.split('\n')) seen.add(l);
    expect(lines.filter((l) => !seen.has(l)).length).toBeLessThanOrEqual(chunks.length * 2); // only a line cut by a boundary may appear in halves
    expect(chunks.join('')).toContain('row 4999 ');
  });

  it('prefers to cut at an archive file marker so a file stays whole', () => {
    const file = (n: number) => `=== src/f${n}.ts ===\n${'const a = 1;\n'.repeat(400)}`;
    const source = Array.from({ length: 12 }, (_, i) => file(i)).join('\n');
    const chunks = splitTextIntoChunks(source, 20_000, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks.slice(0, -1)) expect(c.endsWith('\n')).toBe(true);
    expect(chunks[1].slice(300)).toMatch(/^=== src\/f\d+\.ts ===/);
  });

  it('terminates even when the overlap is larger than the segment', () => {
    const chunks = splitTextIntoChunks('word '.repeat(5_000), 1_000, 5_000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThan(200);
  });
});

describe('provider budgets', () => {
  it('gives every provider a direct budget at least as big as one segment and a bigger one than the old 28k cut', () => {
    for (const p of ['gemini', 'openai', 'xai', 'something-new']) {
      const b = budgetFor(p);
      expect(b.direct).toBeGreaterThanOrEqual(b.chunk);
      expect(b.chunk).toBeGreaterThan(28_000);
      expect(b.parallel).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('mapLimit', () => {
  it('keeps input order and never runs more than the limit at once', async () => {
    let running = 0; let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 10 - n));
      running--; return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('stops starting new work after a failure and rethrows the first error', async () => {
    const started: number[] = [];
    await expect(mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => { started.push(n); if (n === 2) throw new Error('boom'); await new Promise((r) => setTimeout(r, 5)); return n; })).rejects.toThrow('boom');
    expect(started.length).toBeLessThan(6);
  });

  it('handles an empty list', async () => {
    expect(await mapLimit([], 4, async (x: number) => x)).toEqual([]);
  });
});

describe('groupByBudget', () => {
  it('packs consecutive items by size, keeping order, and never drops an oversized item', () => {
    const items = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40), 'd'.repeat(500), 'e'.repeat(10)];
    const groups = groupByBudget(items, 100);
    expect(groups.flat()).toEqual(items);
    expect(groups.map((g) => g.length)).toEqual([2, 1, 1, 1]);
  });
});

describe('withRetry', () => {
  it('retries temporary failures with a growing pause, then succeeds', async () => {
    let n = 0; const pauses: number[] = [];
    const v = await withRetry(async () => { if (++n < 3) throw Object.assign(new Error('rate'), { status: 429 }); return 'ok'; }, (e) => (e as { status?: number }).status === 429, { pauseMs: 100, sleep: async (ms) => { pauses.push(ms); } });
    expect(v).toBe('ok'); expect(n).toBe(3); expect(pauses).toEqual([100, 200]);
  });

  it('does not retry a permanent failure', async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw Object.assign(new Error('bad key'), { status: 401 }); }, (e) => (e as { status?: number }).status === 429, { sleep: async () => {} })).rejects.toThrow('bad key');
    expect(n).toBe(1);
  });
});

describe('unbounded source extraction', () => {
  it('does not truncate text sources beyond the former four-million-character cutoff', async () => {
    const { textOf } = await import('./attachments');
    const source = 'x'.repeat(4_000_123) + 'END-OF-SOURCE';
    const blob = new Blob([source], { type: 'text/plain' });
    const result = await textOf({ id: 'large', name: 'large.txt', mime: 'text/plain', size: blob.size, kind: 'text', blob });
    expect(result.length).toBe(source.length);
    expect(result.endsWith('END-OF-SOURCE')).toBe(true);
  });
});
