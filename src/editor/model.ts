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
  /** look preset id from FX (missing or 'none' = untouched). Older projects have none. */
  fx?: string;
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

/** Look presets for the Effects tool. `f` is appended to the canvas filter; `blur` is in pixels on a 720-high frame. */
export interface Fx { id: string; label: string; f: string; blur?: number; swatch: string; }
export const FX: Fx[] = [
  { id: 'none', label: 'None', f: '', swatch: '#3a3a3a' },
  { id: 'vivid', label: 'Vivid', f: 'saturate(1.45) contrast(1.1)', swatch: '#e2574c' },
  { id: 'warm', label: 'Warm', f: 'sepia(.35) saturate(1.25) hue-rotate(-12deg)', swatch: '#d99a4e' },
  { id: 'cool', label: 'Cool', f: 'hue-rotate(18deg) saturate(1.1) brightness(1.03)', swatch: '#4e8fd9' },
  { id: 'mono', label: 'Mono', f: 'grayscale(1) contrast(1.1)', swatch: '#9a9a9a' },
  { id: 'noir', label: 'Noir', f: 'grayscale(1) contrast(1.45) brightness(.9)', swatch: '#1c1c1c' },
  { id: 'fade', label: 'Fade', f: 'contrast(.85) brightness(1.1) saturate(.8)', swatch: '#b9b2a8' },
  { id: 'retro', label: 'Retro', f: 'sepia(.6) contrast(.95) brightness(1.05)', swatch: '#a8814f' },
  { id: 'dream', label: 'Dream', f: 'brightness(1.08) saturate(1.2)', blur: 1.6, swatch: '#c79be0' },
  { id: 'blur', label: 'Blur', f: '', blur: 6, swatch: '#6b7a8f' },
];
/** The canvas filter for a clip at frame height h: the three sliders plus the chosen look. */
export function filterOf(c: Clip, h = 720): string {
  const fx = FX.find((x) => x.id === c.fx);
  return `brightness(${c.brightness}) contrast(${c.contrast}) saturate(${c.saturation})${fx?.f ? ` ${fx.f}` : ''}${fx?.blur ? ` blur(${((fx.blur * h) / 720).toFixed(2)}px)` : ''}`;
}

/** Subtitles from an .srt or .vtt file as timed lines. */
export function parseSrt(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  const secs = (s: string) => { const p = s.replace(',', '.').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  for (const block of text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const i = lines.findIndex((l) => /-->/.test(l)); if (i < 0) continue;
    const m = lines[i].match(/((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)/); if (!m) continue;
    const t = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim(); const start = secs(m[1]); const end = secs(m[2]);
    if (t && end > start) out.push({ start, end, text: t });
  }
  return out;
}
/** Seconds as 00:00 (or 0:00:00 past an hour). */
export const clock = (t: number) => { const s = Math.max(0, Math.round(t)); const h = Math.floor(s / 3600); const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0'); const ss = String(s % 60).padStart(2, '0'); return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`; };
