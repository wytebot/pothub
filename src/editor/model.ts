export type ClipKind = 'image' | 'video' | 'audio' | 'text';
export interface Clip {
  id: string; kind: ClipKind; track: number; mediaId?: string; name: string;
  start: number; duration: number; trimIn: number; srcDuration?: number;
  x: number; y: number; scale: number; rotate: number; opacity: number; flipX: boolean;
  brightness: number; contrast: number; saturation: number;
  volume: number; fadeIn: number; fadeOut: number;
  text?: string; fontSize?: number; color?: string;
}
export type Aspect = '16:9' | '9:16' | '1:1';
export interface TimelineData { aspect: Aspect; clips: Clip[]; }
export const AUDIO_TRACK = 9;
export const end = (c: Clip) => c.start + c.duration;
export const totalDuration = (cs: Clip[]) => Math.max(1, ...cs.map(end));
export const activeAt = (cs: Clip[], t: number) => cs.filter((c) => t >= c.start && t < end(c));

export function makeClip(p: Partial<Clip> & Pick<Clip, 'id' | 'kind' | 'name'>): Clip {
  return { track: p.kind === 'audio' ? AUDIO_TRACK : 0, start: 0, duration: 5, trimIn: 0, x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, flipX: false, brightness: 1, contrast: 1, saturation: 1, volume: 1, fadeIn: 0, fadeOut: 0, ...p };
}
export function splitClip(c: Clip, t: number, newId: string): [Clip, Clip] | null {
  if (t <= c.start + 0.05 || t >= end(c) - 0.05) return null;
  const d = t - c.start;
  return [{ ...c, duration: d, fadeOut: 0 }, { ...c, id: newId, start: t, duration: c.duration - d, trimIn: c.trimIn + d, fadeIn: 0 }];
}
/** 0..1 multiplier from fade in/out at time t. */
export function fadeFactor(c: Clip, t: number): number {
  let f = 1;
  if (c.fadeIn > 0) f = Math.min(f, (t - c.start) / c.fadeIn);
  if (c.fadeOut > 0) f = Math.min(f, (end(c) - t) / c.fadeOut);
  return Math.max(0, Math.min(1, f));
}
export const canvasSize = (a: Aspect, h: 720 | 1080) => {
  const long = h === 720 ? 1280 : 1920;
  return a === '16:9' ? { w: long, h } : a === '9:16' ? { w: h, h: long } : { w: h, h };
};
