import { IMAGE_MODELS, ratio, type ImageModel } from './registry';
import type { ProviderId } from '../vault/vault';

export function interpret(text: string): { task: 'image' | 'video' | 'edit'; aspect?: string } {
  const t = text.toLowerCase();
  if (/\b(video|animate|animation|moving|clip|film|reel|footage|advertisement|commercial)\b/.test(t) || /\b\d+[- ]?seconds?\b/.test(t)) return { task: 'video' };
  if (/transparent background|remove (the )?background|upscale|inpaint|outpaint|\b(this|my|the attached) (photo|photograph|picture|image)\b/.test(t)) return { task: 'edit' };
  const explicit = t.match(/\b(\d{1,2}):(\d{1,2})\b/);
  if (explicit) return { task: 'image', aspect: explicit[0] };
  if (/vertical|portrait|tiktok|reels?\b|instagram stor/.test(t)) return { task: 'image', aspect: '9:16' };
  if (/widescreen|landscape|youtube|banner/.test(t)) return { task: 'image', aspect: '16:9' };
  if (/\bsquare\b|instagram post/.test(t)) return { task: 'image', aspect: '1:1' };
  return { task: 'image' };
}

export type Plan = { kind: 'ready'; model: ImageModel; aspect: string; notes: string[] } | { kind: 'blocked'; message: string };

export function planImage(o: { prompt: string; formatOverride?: string; prefer: 'quality' | 'speed'; modelOverride?: string; preferredModel?: string; connected: Set<ProviderId>; /** live catalog; defaults to the seed registry */ models?: ImageModel[]; /** models already tried in this run */ exclude?: Set<string>; /** task decided by the caller (e.g. from a /command) */ taskOverride?: 'image' }): Plan {
  const it = o.taskOverride ? { task: 'image' as const, aspect: interpret(o.prompt).aspect } : interpret(o.prompt);
  if (it.task === 'video') return { kind: 'blocked', message: 'This sounds like a video, so nothing was generated here. Open Video Studio to make it, or add /image to your prompt to get a still picture instead.' };
  if (it.task === 'edit') return { kind: 'blocked', message: 'This sounds like an edit to an existing image. Editing, enhancing and background removal are not available yet. Describe the image you want and it will be generated from scratch.' };
  const pool = (o.models ?? IMAGE_MODELS).filter((m) => o.connected.has(m.provider) && !o.exclude?.has(m.id) && (!o.modelOverride || m.id === o.modelOverride));
  if (!pool.length) return { kind: 'blocked', message: o.modelOverride ? 'The selected model needs a key ticked as default for Images. Set one in AI Providers.' : 'Add an API key in AI Providers and tick it as a default for Images to start generating.' };
  const score = (m: ImageModel) => (o.prefer === 'speed' ? m.speed * 10 + m.quality : m.quality * 10 + m.speed);
  const best = (ms: ImageModel[]) => ms.find((m) => m.id === o.preferredModel) ?? [...ms].sort((a, b) => score(b) - score(a))[0];
  const wanted = o.formatOverride ?? it.aspect;
  if (!wanted) { const m = best(pool); return { kind: 'ready', model: m, aspect: '1:1', notes: [] }; }
  const exact = pool.filter((m) => m.aspects.includes(wanted));
  if (exact.length) return { kind: 'ready', model: best(exact), aspect: wanted, notes: [] };
  const target = ratio(wanted); let pick: { m: ImageModel; a: string; d: number } | null = null;
  for (const m of pool) for (const a of m.aspects) { const d = Math.abs(Math.log(ratio(a) / target)); if (!pick || d < pick.d) pick = { m, a, d }; }
  return { kind: 'ready', model: pick!.m, aspect: pick!.a, notes: [`None of your connected models supports ${wanted}. Used ${pick!.a} with ${pick!.m.name}, the closest match.`] };
}
