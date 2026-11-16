import { describe, expect, it } from 'vitest';
import { fadeFactor, makeClip, splitClip, totalDuration } from './model';

describe('editor model', () => {
  const c = makeClip({ id: 'a', kind: 'video', name: 'v', start: 2, duration: 10, trimIn: 1 });
  it('splits a clip and advances the source offset', () => {
    const r = splitClip(c, 6, 'b')!;
    expect(r[0].duration).toBe(4);
    expect(r[1]).toMatchObject({ start: 6, duration: 6, trimIn: 5 });
  });
  it('refuses to split at the edges', () => { expect(splitClip(c, 2.01, 'b')).toBeNull(); });
  it('computes fades', () => {
    const f = { ...c, fadeIn: 2, fadeOut: 2 };
    expect(fadeFactor(f, 3)).toBeCloseTo(0.5); expect(fadeFactor(f, 7)).toBe(1); expect(fadeFactor(f, 11)).toBeCloseTo(0.5);
  });
  it('has a minimum duration of 1s', () => { expect(totalDuration([])).toBe(1); });
});
