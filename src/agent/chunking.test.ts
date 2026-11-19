import { describe, expect, it } from 'vitest';
import { splitTextIntoChunks } from './workflow';

describe('large source chunking', () => {
  it('keeps short content in one unchanged segment', () => {
    expect(splitTextIntoChunks('small source')).toEqual(['small source']);
  });

  it('covers the full source with overlapping segments', () => {
    const source = Array.from({ length: 120_000 }, (_, i) => `line ${i}: important source detail`).join('\n');
    const chunks = splitTextIntoChunks(source);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeLessThanOrEqual(28_000);
    expect(chunks[0]).toContain('line 0:');
    expect(chunks[chunks.length - 1]).toContain(`line 119999:`);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i - 1].slice(-900)).toBe(chunks[i].slice(0, 900));
    }
  });
});
