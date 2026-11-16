import { call, failure, generateImages, type GenImage, type ProviderErr } from '../models/providers';
import type { ImageModel, VideoModel } from '../models/registry';
import { interpret, planImage } from '../models/router';
import { startVideo } from '../models/video';
import { getSecret, listKeys, usableKey, type ProviderId } from '../vault/vault';
import { getSettings } from '../settings';
import { parseCommands, type Flags } from './commands';
import { cachedCatalog, refreshCatalog, type Catalog } from './detect';
import type { RunLog } from './log';

const q = (s: string, n = 64) => { const t = s.replace(/\s+/g, ' ').trim(); return `"${t.length > n ? `${t.slice(0, n - 1)}…` : t}"`; };
const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
const isCancel = (e: unknown) => e instanceof Error && e.message === 'Cancelled.';
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/** Fallback rules: try another model (or provider) unless the user cancelled or a safety filter blocked the prompt. */
export function fallbackScope(e: unknown): 'none' | 'model' | 'provider' {
  if (isCancel(e) || /safety|blocked/i.test(msg(e))) return 'none';
  const s = (e as ProviderErr).status;
  return s === 401 || s === 403 || s === 429 ? 'provider' : 'model';
}

function connected(): Set<ProviderId> { return new Set(listKeys().filter((k) => k.status !== 'invalid').map((k) => k.provider)); }

/** Step 1 of every run: slash commands, plain-language intent, and a live model check that never blocks for more than a few seconds. */
async function prepare(rawPrompt: string, log: RunLog, signal: AbortSignal): Promise<{ text: string; flags: Flags; catalog: Catalog }> {
  const { text, flags } = parseCommands(rawPrompt);
  const s = log.start('cmd', `pothub parse ${q(text)}${flags.used.length ? ` ${flags.used.join(' ')}` : ''}`);
  const it = interpret(text); log.done(s, `intent=${flags.task ?? it.task}${(flags.aspect ?? it.aspect) ? ` aspect=${flags.aspect ?? it.aspect}` : ''}`);

  const d = log.start('cmd', 'providers detect --models');
  const parts: string[] = [];
  const catalog = await refreshCatalog({ signal, onProvider: (p, r) => {
    parts.push(r.source === 'unavailable' ? `${p} ✕ (${r.reason ?? 'unreachable'})` : `${p} ✓ ${r.count} models${r.source === 'cache' ? ' (cached)' : ''}`);
    log.update(d, { detail: parts.join('  ·  ') });
  } });
  log.done(d, `${catalog.image.length} image · ${catalog.video.length} video available${catalog.unverified.length ? ` · ${catalog.unverified.join(', ')} unverified` : ''}`);
  return { text, flags, catalog };
}

/** Optional: asks the cheapest current Gemini text model to sharpen the prompt. 8 s cap; any failure keeps the original prompt. */
async function enhance(text: string, catalog: Catalog, log: RunLog, signal: AbortSignal, task: 'image' | 'video'): Promise<string> {
  const model = catalog.text; const key = usableKey('gemini');
  if (!model || !key) { log.say('warn', 'enhance skipped', 'needs a Google Gemini key'); return text; }
  const id = log.start('cmd', `${model.id} enhance-prompt`);
  try {
    const secret = await getSecret(key.id);
    const sys = task === 'video'
      ? 'Rewrite the user\'s idea as one vivid video prompt: subject, action, camera movement, lighting, mood. Under 90 words. Keep every detail the user gave. Output only the prompt.'
      : 'Rewrite the user\'s idea as one vivid image prompt: subject, setting, composition, lighting, style. Under 70 words. Keep every detail the user gave. Output only the prompt.';
    const sig = 'any' in AbortSignal ? (AbortSignal as unknown as { any(s: AbortSignal[]): AbortSignal }).any([signal, AbortSignal.timeout(8000)]) : signal;
    const r = await call(`https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`, { method: 'POST', signal: sig, headers: { 'x-goog-api-key': secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ parts: [{ text }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 220 } }) }, secret);
    if (!r.ok) throw await failure(r, secret);
    const out = ((await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    if (!out || out.length < 8) throw new Error('empty');
    log.done(id, q(out, 110)); return out;
  } catch (e) { if (isCancel(e)) throw e; log.fail(id, 'kept your original prompt'); return text; }
}

const wantEnhance = (f: Flags) => (f.plain ? false : f.enhance || getSettings().enhance);

export interface ImageResult { images: GenImage[]; model: ImageModel; aspect: string; notes: string[]; prompt: string; }
/** `/models` and similar commands: prints what is available, generates nothing. Returns true when handled. */
export async function runInfo(rawPrompt: string, log: RunLog, signal: AbortSignal): Promise<boolean> {
  if (!parseCommands(rawPrompt).flags.models) return false;
  const { catalog } = await prepare(rawPrompt, log, signal);
  for (const m of catalog.image) log.say('info', `image  ${m.id}`, `${m.name}${m.discovered ? ' · new' : ''} · ${m.aspects.length} ratios`);
  for (const m of catalog.video) log.say('info', `video  ${m.id}`, `${m.name}${m.discovered ? ' · new' : ''} · ${m.aspects.join(', ')}`);
  if (catalog.text) log.say('info', `text   ${catalog.text.id}`, 'used for /enhance');
  if (!catalog.image.length && !catalog.video.length) log.say('warn', 'no models available', 'add a key in AI Providers');
  return true;
}

export async function runImage(o: { prompt: string; count: number; format: string; prefer: 'quality' | 'speed'; model: string; signal: AbortSignal; log: RunLog; left: number; limit: number; premium: boolean }): Promise<ImageResult> {
  const { log, signal } = o;
  const { text, flags, catalog } = await prepare(o.prompt, log, signal);
  if (!text) throw new Error('Describe the image first (commands alone are not a prompt).');
  const count = flags.count ?? o.count;
  if (!o.premium) { if (o.left < count) throw new Error(`You have ${o.left} free image(s) left today (limit ${o.limit}, resets at 00:00 UTC). Lower the count or come back tomorrow.`); log.say('info', 'quota', `${o.left} of ${o.limit} free images left today`); }
  const prompt = wantEnhance(flags) ? await enhance(text, catalog, log, signal, 'image') : text;
  const tried = new Set<string>(); const skipProviders = new Set<ProviderId>(); const notes: string[] = []; let lastErr: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    const conn = new Set([...connected()].filter((p) => !skipProviders.has(p)));
    const r = log.start('cmd', `pothub route --task image${(flags.aspect ?? (o.format !== 'auto' ? o.format : '')) ? ` --aspect ${flags.aspect ?? o.format}` : ''} --prefer ${flags.prefer ?? o.prefer}`);
    const plan = planImage({ prompt, formatOverride: flags.aspect ?? (o.format === 'auto' ? undefined : o.format), prefer: flags.prefer ?? o.prefer, modelOverride: flags.model ?? (o.model === 'auto' ? undefined : o.model), preferredModel: getSettings().imageModel === 'auto' ? undefined : getSettings().imageModel, connected: conn, models: catalog.image, exclude: tried, taskOverride: flags.task === 'image' ? 'image' : undefined });
    if (plan.kind === 'blocked') { log.fail(r, 'no model'); throw attempt === 0 ? new Error(plan.message) : (lastErr instanceof Error ? lastErr : new Error(plan.message)); }
    log.done(r, `→ ${plan.model.name}  (${plan.model.id}) @ ${plan.aspect}`);
    for (const n of plan.notes) { notes.push(n); log.say('warn', n); }

    const i = log.start('cmd', `init image --model ${plan.model.id} --n ${count}`);
    const key = usableKey(plan.model.provider); if (!key) { log.fail(i, 'no key'); throw new Error('Add an API key in AI Providers first.'); }
    let secret: string; try { secret = await getSecret(key.id); log.done(i, `${plan.model.provider} key ready (••••${key.last4})`); } catch (e) { log.fail(i, msg(e)); throw e; }

    const g = log.start('cmd', `generate ${q(prompt, 48)}`); const t0 = Date.now(); const made: GenImage[] = [];
    try {
      let todo = count;
      while (todo > 0) { const k = Math.min(todo, plan.model.maxBatch); made.push(...await generateImages(plan.model.provider, secret, { model: plan.model.id, prompt, aspect: plan.aspect, count: k, signal })); todo -= k; log.update(g, { detail: `${made.length}/${count} done` }); }
      const bytes = made.reduce((n, m) => n + m.blob.size, 0);
      log.done(g, `${made.length} image${made.length > 1 ? 's' : ''} · ${(bytes / 1_048_576).toFixed(1)} MB · ${secs(Date.now() - t0)}`);
      return { images: made, model: plan.model, aspect: plan.aspect, notes, prompt };
    } catch (e) {
      lastErr = e; log.fail(g, msg(e));
      const scope = fallbackScope(e); if (scope === 'none') throw e;
      tried.add(plan.model.id); if (scope === 'provider') skipProviders.add(plan.model.provider);
      if (made.length) throw e; // part of the batch already cost money: do not silently start over
      log.say('warn', `falling back after ${plan.model.id} failed`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Generation failed. Try again.');
}

export interface VideoStart { op: string; model: VideoModel; aspect: string; prompt: string; }
export async function runVideoStart(o: { prompt: string; modelId: string; signal: AbortSignal; log: RunLog; left: number; limit: number; premium: boolean }): Promise<VideoStart> {
  const { log, signal } = o;
  const { text, flags, catalog } = await prepare(o.prompt, log, signal);
  if (!text) throw new Error('Describe the video first (commands alone are not a prompt).');
  if (!o.premium) { if (o.left < 1) throw new Error(`Daily free limit of ${o.limit} videos reached. It resets at 00:00 UTC.`); log.say('info', 'quota', `${o.left} of ${o.limit} free videos left today`); }
  const prompt = wantEnhance(flags) ? await enhance(text, catalog, log, signal, 'video') : text;
  const wanted = flags.aspect ?? interpret(text).aspect; const tried = new Set<string>(); let lastErr: unknown;
  const pref = flags.prefer ?? getSettings().priority;

  for (let attempt = 0; attempt < 3; attempt++) {
    const pool = catalog.video.filter((m) => !tried.has(m.id));
    const forced = flags.model ?? (o.modelId !== 'auto' ? o.modelId : undefined);
    const r = log.start('cmd', `pothub route --task video${wanted ? ` --aspect ${wanted}` : ''} --prefer ${pref}`);
    const order = [...pool].sort((a, b) => (pref === 'speed' ? b.speed * 10 + b.quality - (a.speed * 10 + a.quality) : b.quality * 10 + b.speed - (a.quality * 10 + a.speed)));
    const exact = wanted ? order.filter((m) => m.aspects.includes(wanted)) : order;
    const model = (forced && pool.find((m) => m.id === forced)) || (getSettings().videoModel !== 'auto' && (exact.length ? exact : order).find((m) => m.id === getSettings().videoModel)) || (exact.length ? exact : order)[0];
    if (!model) { log.fail(r, 'no model'); throw attempt === 0 ? new Error('No video model is available on your connected keys. Add a Google Gemini key in AI Providers.') : (lastErr instanceof Error ? lastErr : new Error('No video model is available.')); }
    const aspect = wanted && model.aspects.includes(wanted) ? wanted : model.aspects[0];
    log.done(r, `→ ${model.name}  (${model.id}) @ ${aspect}${wanted && wanted !== aspect ? `  (${wanted} not supported)` : ''}`);

    const i = log.start('cmd', `init video --model ${model.id} --seconds ${model.durations[0]}`);
    const key = usableKey(model.provider); if (!key) { log.fail(i, 'no key'); throw new Error('Add a Google Gemini key in AI Providers first.'); }
    let secret: string; try { secret = await getSecret(key.id); log.done(i, 'key ready'); } catch (e) { log.fail(i, msg(e)); throw e; }

    const s = log.start('cmd', 'operations.submit'); const t0 = Date.now();
    try { const op = await startVideo(secret, { model: model.id, prompt, aspect }); log.done(s, `accepted in ${secs(Date.now() - t0)} · job ${op.split('/').pop()?.slice(0, 12) ?? ''}`); return { op, model, aspect, prompt }; }
    catch (e) { lastErr = e; log.fail(s, msg(e)); if (fallbackScope(e) === 'none' || (e as ProviderErr).status === 401 || (e as ProviderErr).status === 403 || (e as ProviderErr).status === 429) throw e; tried.add(model.id); log.say('warn', `falling back after ${model.id} failed`); }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not start the video.');
}
