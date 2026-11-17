export type ClipKind = 'image' | 'video' | 'audio' | 'text';
export interface Clip {
  id: string; kind: ClipKind; track: number; mediaId?: string; name: string;
  start: number; duration: number; trimIn: number; srcDuration?: number;
  x: number; y: number; scale: number; rotate: number; opacity: number; flipX: boolean;
  brightness: number; contrast: number; saturation: number;
  volume: number; fadeIn: number; fadeOut: number;
  /** playback speed of video/audio, 1 = normal. Missing on older projects, so always read it with speedOf. */
  speed?: number;
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
export const speedOf = (c: Clip) => (c.kind === 'video' || c.kind === 'audio' ? c.speed ?? 1 : 1);
/** Position inside the source file that plays at timeline time t. */
export const srcAt = (c: Clip, t: number) => c.trimIn + (t - c.start) * speedOf(c);
/** Longest this clip can be on the timeline before it runs out of source. */
export const maxDuration = (c: Clip) => (c.srcDuration ? Math.max(0.2, (c.srcDuration - c.trimIn) / speedOf(c)) : Infinity);
export function splitClip(c: Clip, t: number, newId: string): [Clip, Clip] | null {
  if (t <= c.start + 0.05 || t >= end(c) - 0.05) return null;
  const d = t - c.start;
  return [{ ...c, duration: d, fadeOut: 0 }, { ...c, id: newId, start: t, duration: c.duration - d, trimIn: c.trimIn + d * speedOf(c), fadeIn: 0 }];
}
/** Cuts everything before t off the clip. Null when t is not inside it. */
export function trimStartTo(c: Clip, t: number): Clip | null {
  if (t <= c.start + 0.05 || t >= end(c) - 0.05) return null;
  const d = t - c.start;
  return { ...c, start: t, duration: c.duration - d, trimIn: c.trimIn + d * speedOf(c), fadeIn: 0 };
}
/** Cuts everything after t off the clip. Null when t is not inside it. */
export function trimEndTo(c: Clip, t: number): Clip | null {
  if (t <= c.start + 0.05 || t >= end(c) - 0.05) return null;
  return { ...c, duration: t - c.start, fadeOut: 0 };
}
/** Changes speed but keeps the same stretch of source, so the clip gets shorter when faster and longer when slower. */
export function withSpeed(c: Clip, s: number): Pick<Clip, 'speed' | 'duration'> {
  const v = Math.min(4, Math.max(0.25, s));
  return { speed: v, duration: Math.max(0.2, (c.duration * speedOf(c)) / v) };
}
/** Removes a clip and slides later clips on the same track left to close the gap. */
export function rippleDelete(clips: Clip[], id: string): Clip[] {
  const c = clips.find((x) => x.id === id); if (!c) return clips;
  return clips.filter((x) => x.id !== id).map((x) => (x.track === c.track && x.start >= end(c) - 1e-6 ? { ...x, start: Math.max(0, x.start - c.duration) } : x));
}
/** Times a dragged clip or the playhead can snap to: 0 and every clip edge except the one being dragged. */
export const snapPoints = (clips: Clip[], skipId?: string): number[] => [...new Set([0, ...clips.filter((c) => c.id !== skipId).flatMap((c) => [c.start, end(c)])])].sort((a, b) => a - b);
/** Moves t onto the nearest point within `within` seconds, or returns it untouched. */
export function snapTo(t: number, points: number[], within: number): number {
  let best = t; let d = within;
  for (const p of points) { const k = Math.abs(p - t); if (k <= d) { d = k; best = p; } }
  return best;
}
/** Nearest cut (clip edge) before or after t. */
export function neighborCut(clips: Clip[], t: number, dir: -1 | 1): number | null {
  const pts = snapPoints(clips).filter((p) => (dir < 0 ? p < t - 0.02 : p > t + 0.02));
  return pts.length ? (dir < 0 ? pts[pts.length - 1] : pts[0]) : null;
}
/** Scale that makes an iw x ih picture cover a cw x ch frame (the editor's scale 1 fits it inside). */
export const fillScale = (iw: number, ih: number, cw: number, ch: number) => { const a = cw / iw; const b = ch / ih; return Math.max(a, b) / Math.min(a, b); };
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
