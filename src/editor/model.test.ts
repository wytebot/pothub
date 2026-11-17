import { describe, expect, it } from 'vitest';
import { fadeFactor, fillScale, makeClip, maxDuration, neighborCut, rippleDelete, snapPoints, snapTo, speedOf, splitClip, srcAt, totalDuration, trimEndTo, trimStartTo, withSpeed } from './model';

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

  it('keeps the source position right when a sped-up clip is split', () => {
    const f = { ...c, speed: 2 };
    expect(srcAt(f, 4)).toBe(1 + 2 * 2);
    expect(splitClip(f, 6, 'b')![1]).toMatchObject({ start: 6, duration: 6, trimIn: 1 + 4 * 2 });
  });
  it('changes length with speed and keeps the same source span', () => {
    const r = withSpeed(c, 2); expect(r).toEqual({ speed: 2, duration: 5 });
    expect(withSpeed(c, 100).speed).toBe(4); expect(withSpeed(c, 0).speed).toBe(0.25);
    expect(speedOf(makeClip({ id: 'i', kind: 'image', name: 'i' }))).toBe(1);
  });
  it('limits a clip to what is left of its source, scaled by speed', () => {
    const v = { ...c, srcDuration: 11, trimIn: 1, speed: 2 }; expect(maxDuration(v)).toBe(5);
  });
  it('trims to the playhead', () => {
    expect(trimStartTo(c, 6)).toMatchObject({ start: 6, duration: 6, trimIn: 5 });
    expect(trimEndTo(c, 6)).toMatchObject({ start: 2, duration: 4 });
    expect(trimStartTo(c, 20)).toBeNull();
  });
  it('ripple delete closes the gap on the same track only', () => {
    const a = makeClip({ id: 'a', kind: 'video', name: 'a', start: 0, duration: 4 });
    const b = makeClip({ id: 'b', kind: 'video', name: 'b', start: 4, duration: 3 });
    const o = makeClip({ id: 'o', kind: 'text', name: 'o', track: 1, start: 5, duration: 1 });
    const r = rippleDelete([a, b, o], 'a');
    expect(r.find((x) => x.id === 'b')!.start).toBe(0); expect(r.find((x) => x.id === 'o')!.start).toBe(5);
  });
  it('snaps to nearby edges and finds neighbouring cuts', () => {
    const a = makeClip({ id: 'a', kind: 'video', name: 'a', start: 0, duration: 4 });
    const b = makeClip({ id: 'b', kind: 'video', name: 'b', start: 6, duration: 2 });
    const pts = snapPoints([a, b]); expect(pts).toEqual([0, 4, 6, 8]);
    expect(snapTo(4.1, pts, 0.2)).toBe(4); expect(snapTo(5, pts, 0.2)).toBe(5);
    expect(neighborCut([a, b], 5, 1)).toBe(6); expect(neighborCut([a, b], 5, -1)).toBe(4); expect(neighborCut([a, b], 8, 1)).toBeNull();
  });
  it('fill scale covers the frame', () => { expect(fillScale(1920, 1080, 1080, 1920)).toBeCloseTo(3.16, 1); expect(fillScale(100, 100, 100, 100)).toBe(1); });
});
