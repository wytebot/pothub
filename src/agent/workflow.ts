import { call, failure, generateImages, type GenImage, type ProviderErr } from '../models/providers';
import { generateText, rankText, type ChatTurn, type TextModel } from '../models/text';
import { base64Of, type Attachment } from './attachments';
import { buildFile, systemPrompt, wantedOutput, type OutFile } from './deliver';
import { buildBundle, bundleSummary } from './bundle';
import type { ImageModel, VideoModel } from '../models/registry';
import { interpret, planImage } from '../models/router';
import { startVideo } from '../models/video';
import { PROVIDERS } from '../models/providerInfo';
import { defaultKeys, getSecret, setStatus, usableKey, type ProviderId } from '../vault/vault';
import type { Fn } from '../models/providerInfo';
import { getSettings } from '../settings';
import { parseCommands, type Flags } from './commands';
import { refreshCatalog, type Catalog } from './detect';
import type { RunLog } from './log';

const q = (s: string, n = 64) => { const t = s.replace(/\s+/g, ' ').trim(); return `"${t.length > n ? `${t.slice(0, n - 1)}…` : t}"`; };
const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
const isCancel = (e: unknown) => e instanceof Error && e.message === 'Cancelled.';
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/** Fallback rules: try another model (or provider) unless the user cancelled or a safety filter blocked the prompt. */
export function fallbackScope(e: unknown): 'none' | 'model' | 'provider' {
  if (isCancel(e) || /safety|blocked/i.test(msg(e))) return 'none';
  const s = (e as ProviderErr).status;
  return s === 401 || s === 402 || s === 403 || s === 429 ? 'provider' : 'model';
}

/** Providers that still have an untried default key for this function. Keys that are not ticked as a default are never used. */
const connected = (fn: Fn, skip?: ReadonlySet<string>): Set<ProviderId> => new Set(defaultKeys(fn, skip).map((k) => k.provider));

/** Step 1 of every run: slash commands, plain-language intent, and a live model check that never blocks for more than a few seconds. */
async function prepare(rawPrompt: string, log: RunLog, signal: AbortSignal): Promise<{ text: string; flags: Flags; catalog: Catalog }> {
  log.step('Reading your request…');
  const { text, flags } = parseCommands(rawPrompt);
  const s = log.start('cmd', `pothub parse ${q(text)}${flags.used.length ? ` ${flags.used.join(' ')}` : ''}`);
  const it = interpret(text); log.done(s, `intent=${flags.task ?? it.task}${(flags.aspect ?? it.aspect) ? ` aspect=${flags.aspect ?? it.aspect}` : ''}`);

  log.step('Checking which AI models are ready…');
  const d = log.start('cmd', 'providers detect --models');
  const parts: string[] = [];
  const catalog = await refreshCatalog({ signal, onProvider: (p, r) => {
    parts.push(r.source === 'unavailable' ? `${PROVIDERS[p].name} ✕ (${r.reason ?? 'unreachable'})` : r.source === 'builtin' ? `${PROVIDERS[p].name} ✓ ${r.count} models` : `${PROVIDERS[p].name} ✓ ${r.count} models${r.source === 'cache' ? ' (cached)' : ''}`);
    log.update(d, { detail: parts.join('  ·  ') });
  } });
  log.done(d, `${catalog.image.length} image · ${catalog.video.length} video available${catalog.unverified.length ? ` · ${catalog.unverified.map((x) => PROVIDERS[x].name).join(', ')} unverified` : ''}`);
  return { text, flags, catalog };
}

/** Optional: asks the cheapest current Gemini text model to sharpen the prompt. 8 s cap; any failure keeps the original prompt. */
async function enhance(text: string, catalog: Catalog, log: RunLog, signal: AbortSignal, task: 'image' | 'video'): Promise<string> {
  const model = catalog.text; const key = usableKey('gemini', 'text');
  if (!model || !key) { log.say('warn', 'enhance skipped', 'needs a Google Gemini key ticked as default for Text'); return text; }
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

export async function runImage(o: { /** the caller already decided this is an image request */ routed?: boolean; /** photos added with the + button: they are edited or used as a reference */ refs?: Attachment[]; prompt: string; count: number; format: string; prefer: 'quality' | 'speed'; model: string; signal: AbortSignal; log: RunLog; left: number; limit: number; premium: boolean }): Promise<ImageResult> {
  const { log, signal } = o;
  const { text, flags, catalog } = await prepare(o.prompt, log, signal);
  if (!text) throw new Error('Describe the image first (commands alone are not a prompt).');
  const count = flags.count ?? o.count;
  if (!o.premium) { if (o.left < count) throw new Error(`You have ${o.left} free image(s) left today (limit ${o.limit}, resets at 00:00 UTC). Lower the count or come back tomorrow.`); log.say('info', 'quota', `${o.left} of ${o.limit} free images left today`); }
  const prompt = wantEnhance(flags) ? await enhance(text, catalog, log, signal, 'image') : text;
  const refs = o.refs?.length ? await Promise.all(o.refs.slice(0, 4).map(async (a) => ({ mime: a.mime, data: await base64Of(a.blob) }))) : undefined;
  const tried = new Set<string>(); const skipKeys = new Set<string>(); const notes: string[] = []; let lastErr: unknown;

  // Every default key for Images can be tried once, plus a few model fallbacks.
  for (let attempt = 0, max = Math.min(10, 3 + defaultKeys('image').length); attempt < max; attempt++) {
    const conn = refs ? new Set([...connected('image', skipKeys)].filter((p) => p === 'gemini')) : connected('image', skipKeys);
    if (refs && !conn.size) throw new Error('Editing a photo needs a Google Gemini key ticked as default for Images. Add one in AI Providers, then send this again.');
    log.step(attempt === 0 ? 'Choosing the best image model…' : 'Trying another model…');
    const r = log.start('cmd', `pothub route --task image${(flags.aspect ?? (o.format !== 'auto' ? o.format : '')) ? ` --aspect ${flags.aspect ?? o.format}` : ''} --prefer ${flags.prefer ?? o.prefer}`);
    const plan = planImage({ prompt, formatOverride: flags.aspect ?? (o.format === 'auto' ? undefined : o.format), prefer: flags.prefer ?? o.prefer, modelOverride: flags.model ?? (o.model === 'auto' ? undefined : o.model), preferredModel: getSettings().imageModel === 'auto' ? undefined : getSettings().imageModel, connected: conn, models: catalog.image, exclude: tried, taskOverride: flags.task === 'image' || o.routed ? 'image' : undefined });
    if (plan.kind === 'blocked') { log.fail(r, 'no model'); throw attempt === 0 ? new Error(plan.message) : (lastErr instanceof Error ? lastErr : new Error(plan.message)); }
    log.done(r, `→ ${plan.model.name}  (${plan.model.id}) @ ${plan.aspect}`);
    for (const n of plan.notes) { notes.push(n); log.say('warn', n); }

    const i = log.start('cmd', `init image --model ${plan.model.id} --n ${count}`);
    const key = usableKey(plan.model.provider, 'image', skipKeys); if (!key) { log.fail(i, 'no default key'); throw new Error(`Tick a ${PROVIDERS[plan.model.provider].name} key as default for Images in AI Providers first.`); }
    let secret: string; try { secret = await getSecret(key.id); log.done(i, `default key "${key.label}" ready (${plan.model.provider} ••••${key.last4})`); } catch (e) { log.fail(i, msg(e)); skipKeys.add(key.id); lastErr = e; log.say('warn', `skipping "${key.label}"`, 'its secret could not be opened'); continue; }

    log.step(refs ? 'Editing your photo…' : 'Creating your image…');
    const g = log.start('cmd', `generate ${q(prompt, 48)}`); const t0 = Date.now(); const made: GenImage[] = [];
    try {
      let todo = count;
      while (todo > 0) { const k = Math.min(todo, plan.model.maxBatch); made.push(...await generateImages(plan.model.provider, secret, { model: plan.model.id, prompt, aspect: refs && !(flags.aspect ?? (o.format !== 'auto' ? o.format : '')) ? '' : plan.aspect, count: k, signal, refs })); todo -= k; log.update(g, { detail: `${made.length}/${count} done` }); }
      const bytes = made.reduce((n, m) => n + m.blob.size, 0);
      log.done(g, `${made.length} image${made.length > 1 ? 's' : ''} · ${(bytes / 1_048_576).toFixed(1)} MB · ${secs(Date.now() - t0)}`);
      return { images: made, model: plan.model, aspect: plan.aspect, notes, prompt };
    } catch (e) {
      lastErr = e; log.fail(g, msg(e));
      const scope = fallbackScope(e); if (scope === 'none') throw e;
      if (made.length) throw e; // part of the batch already cost money: do not silently start over
      if (scope === 'provider') { skipKeys.add(key.id); if ((e as ProviderErr).status === 401) setStatus(key.id, 'invalid'); log.say('warn', `default key "${key.label}" failed`, 'trying the next default for Images'); log.step('That key did not work. Trying your next one…'); }
      else { tried.add(plan.model.id); log.say('warn', `falling back after ${plan.model.id} failed`); log.step('That model did not respond. Trying another…'); }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Generation failed. Try again.');
}

export interface VideoStart { op: string; model: VideoModel; aspect: string; prompt: string; keyId: string; }
export async function runVideoStart(o: { prompt: string; modelId: string; signal: AbortSignal; log: RunLog; left: number; limit: number; premium: boolean }): Promise<VideoStart> {
  const { log, signal } = o;
  const { text, flags, catalog } = await prepare(o.prompt, log, signal);
  if (!text) throw new Error('Describe the video first (commands alone are not a prompt).');
  if (!o.premium) { if (o.left < 1) throw new Error(`Daily free limit of ${o.limit} videos reached. It resets at 00:00 UTC.`); log.say('info', 'quota', `${o.left} of ${o.limit} free videos left today`); }
  const prompt = wantEnhance(flags) ? await enhance(text, catalog, log, signal, 'video') : text;
  const wanted = flags.aspect ?? interpret(text).aspect; const tried = new Set<string>(); const skipKeys = new Set<string>(); let lastErr: unknown;
  const pref = flags.prefer ?? getSettings().priority;

  for (let attempt = 0, max = Math.min(10, 3 + defaultKeys('video').length); attempt < max; attempt++) {
    const live = connected('video', skipKeys);
    const pool = catalog.video.filter((m) => !tried.has(m.id) && live.has(m.provider));
    const forced = flags.model ?? (o.modelId !== 'auto' ? o.modelId : undefined);
    log.step(attempt === 0 ? 'Choosing the best video model…' : 'Trying another model…');
    const r = log.start('cmd', `pothub route --task video${wanted ? ` --aspect ${wanted}` : ''} --prefer ${pref}`);
    const order = [...pool].sort((a, b) => (pref === 'speed' ? b.speed * 10 + b.quality - (a.speed * 10 + a.quality) : b.quality * 10 + b.speed - (a.quality * 10 + a.speed)));
    const exact = wanted ? order.filter((m) => m.aspects.includes(wanted)) : order;
    const model = (forced && pool.find((m) => m.id === forced)) || (getSettings().videoModel !== 'auto' && (exact.length ? exact : order).find((m) => m.id === getSettings().videoModel)) || (exact.length ? exact : order)[0];
    if (!model) { log.fail(r, 'no model'); throw attempt === 0 ? new Error('No video model is available on your connected keys. Add a key from a video provider (Google Gemini, OpenAI, Luma, Kling, fal.ai and others) in AI Providers and tick it as default for Video.') : (lastErr instanceof Error ? lastErr : new Error('No video model is available.')); }
    const aspect = wanted && model.aspects.includes(wanted) ? wanted : model.aspects[0];
    log.done(r, `→ ${model.name}  (${model.id}) @ ${aspect}${wanted && wanted !== aspect ? `  (${wanted} not supported)` : ''}`);

    const i = log.start('cmd', `init video --model ${model.id} --seconds ${model.durations[0]}`);
    const key = usableKey(model.provider, 'video', skipKeys); if (!key) { log.fail(i, 'no default key'); throw new Error(`Tick a ${PROVIDERS[model.provider].name} key as default for Video in AI Providers first.`); }
    let secret: string; try { secret = await getSecret(key.id); log.done(i, `default key "${key.label}" ready`); } catch (e) { log.fail(i, msg(e)); skipKeys.add(key.id); lastErr = e; log.say('warn', `skipping "${key.label}"`, 'its secret could not be opened'); continue; }

    log.step('Sending your video to the studio…');
    const s = log.start('cmd', 'operations.submit'); const t0 = Date.now();
    try { const op = await startVideo(model.provider, secret, { model, prompt, aspect }); log.done(s, `accepted in ${secs(Date.now() - t0)} · job ${op.split('/').pop()?.slice(0, 12) ?? ''}`); return { op, model, aspect, prompt, keyId: key.id }; }
    catch (e) {
      lastErr = e; log.fail(s, msg(e)); const scope = fallbackScope(e); if (scope === 'none') throw e;
      if (scope === 'provider') { skipKeys.add(key.id); if ((e as ProviderErr).status === 401) setStatus(key.id, 'invalid'); log.say('warn', `default key "${key.label}" failed`, 'trying the next default for Video'); log.step('That key did not work. Trying your next one…'); }
      else { tried.add(model.id); log.say('warn', `falling back after ${model.id} failed`); log.step('That model did not respond. Trying another…'); }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not start the video.');
}

export interface TextOutcome { text: string; model: TextModel; file: OutFile | null; notes: string[]; }
/** Text models that answered last time, and ones that hit a quota recently, so the next request starts with what works. */
const GOOD = 'agent.text.good.v1'; const BLOCKED = 'agent.text.blocked.v1'; const BLOCK_MS = 45 * 60_000;
const readJson = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T; } catch { return d; } };
const goodModel = (): string | undefined => readJson<{ id?: string }>(GOOD, {}).id;
const saveGood = (id: string) => { try { localStorage.setItem(GOOD, JSON.stringify({ id })); } catch { /* storage blocked */ } };
const blockedNow = (): Set<string> => { const all = readJson<Record<string, number>>(BLOCKED, {}); const now = Date.now(); return new Set(Object.entries(all).filter(([, t]) => t > now).map(([id]) => id)); };
const block = (ids: string[]) => { try { const all = readJson<Record<string, number>>(BLOCKED, {}); const now = Date.now(); for (const k of Object.keys(all)) if (all[k] <= now) delete all[k]; for (const id of ids) all[id] = now + BLOCK_MS; localStorage.setItem(BLOCKED, JSON.stringify(all)); } catch { /* storage blocked */ } };
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Chat, writing, analysis, coding and documents. Picks the best ready text model for the files and the request,
 * streams the answer as it is written, falls back to another model or key if one fails, and builds a file when the person asked for one.
 */
export async function runText(o: { prompt: string; files: Attachment[]; history: ChatTurn[]; prefer: 'quality' | 'speed'; signal: AbortSignal; log: RunLog; onText: (soFar: string) => void }): Promise<TextOutcome> {
  const { log, signal } = o;
  const { text, flags, catalog } = await prepare(o.prompt, log, signal);
  if (!text && !o.files.length) throw new Error('Type your question or request first (commands alone are not a prompt).');
  const prompt = text || 'Describe and summarise the attached file(s) in detail.';
  const wanted = wantedOutput(prompt); const notes: string[] = [];
  if (wanted.note) notes.push(wanted.note);
  const pref = flags.prefer ?? o.prefer;
  const skipKeys = new Set<string>(); const tried = new Set<string>(); let lastErr: unknown; let partial = '';

  for (let attempt = 0, max = Math.min(10, 6 + defaultKeys('text').length); attempt < max; attempt++) {
    log.step(attempt === 0 ? 'Choosing the best text model…' : 'Trying another model…');
    const live = new Set(defaultKeys('text', skipKeys).map((k) => k.provider));
    const usable = catalog.texts.filter((m) => live.has(m.provider) && !tried.has(m.id)); const cool = blockedNow();
    const pool = usable.filter((m) => !cool.has(m.id)).length ? usable.filter((m) => !cool.has(m.id)) : usable;
    const r = log.start('cmd', `pothub route --task text --prefer ${pref}${o.files.length ? ` --files ${o.files.length}` : ''}`);
    const ranked = rankText(pool, pref, { kinds: o.files.map((f) => f.kind) });
    const want = flags.model ?? (getSettings().textModel !== 'auto' ? getSettings().textModel : undefined);
    const forced = want ? ranked.find((m) => m.id === want) : undefined;
    const model = forced ?? ranked.find((m) => m.id === goodModel()) ?? ranked[0];
    if (!model) {
      log.fail(r, 'no model');
      if (lastErr instanceof Error) throw lastErr;
      if (!defaultKeys('text').length) throw new Error('No text model is available on your connected keys. Add a key from Google Gemini, OpenAI or xAI in AI Providers and tick it as default for Text & documents.');
      throw new Error('I could not check which models your key can use right now. Try again in a moment.');
    }
    log.done(r, `→ ${model.name}  (${model.id})`);
    const key = usableKey(model.provider, 'text', skipKeys); if (!key) { tried.add(model.id); continue; }
    let secret: string; try { secret = await getSecret(key.id); } catch (e) { skipKeys.add(key.id); lastErr = e; log.say('warn', `skipping "${key.label}"`, 'its secret could not be opened'); continue; }

    log.step(o.files.length ? 'Reading your files and writing…' : wanted.file ? `Writing your ${wanted.format === 'docx' ? 'document' : 'file'}…` : 'Writing your answer…');
    const g = log.start('cmd', `${model.id} generate ${q(prompt, 40)}`); const t0 = Date.now(); partial = '';
    try {
      const out = await generateText(model.provider, secret, { model: model.id, system: systemPrompt(wanted, { today: today(), hasFiles: o.files.length > 0 }), history: o.history, prompt, files: o.files, signal, onText: (t) => { partial = t; o.onText(t); } });
      log.done(g, `${out.text.length.toLocaleString()} characters · ${secs(Date.now() - t0)}`);
      if (out.unread.length) notes.push(`${model.name} cannot read ${out.unread.join(', ')}, so ${out.unread.length > 1 ? 'those were' : 'it was'} left out. Add a Google Gemini key for Text & documents to include videos and audio.`);
      if (out.truncated) notes.push('The answer reached the model\'s length limit. Ask me to continue and I will pick up from here.');
      let file: OutFile | null = null;
      if (wanted.file) {
        log.step(wanted.format === 'zip' ? 'Packing your files…' : 'Preparing your file…');
        try {
          if (wanted.format === 'zip') {
            // attached files travel with the new ones when the request says "with these / my files"
            const keep = o.files.length > 0 && /\b(with|including|plus|and)\b[^.?!\n]{0,40}\b(these|them|my|attached|uploaded|files?)\b/i.test(prompt);
            const extra = keep ? await Promise.all(o.files.map(async (f) => ({ path: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) }))) : [];
            const b = await buildBundle(out.text, prompt.length > 60 ? prompt.slice(0, 60) : prompt, extra);
            if (b) { file = { blob: b.blob, name: b.name, mime: 'application/zip' }; notes.push(...b.notes); log.say('ok', 'zip ready', bundleSummary(b.files)); }
          } else file = await buildFile(out.text, wanted, prompt);
        } catch { notes.push('The answer is above, but I could not build the file this time. You can copy it from the chat.'); }
      }
      saveGood(model.id);
      return { text: out.text, model, file, notes };
    } catch (e) {
      lastErr = e; log.fail(g, msg(e));
      const scope = fallbackScope(e); if (scope === 'none') throw e;
      // Most of the answer already arrived and then the connection dropped: keep what we have instead of starting over.
      if (partial.length > 400) { log.say('warn', 'kept the partial answer'); return { text: partial, model, file: null, notes: [...notes, 'The connection dropped near the end, so this answer may be cut short. Ask me to continue and I will pick up from here.'] }; }
      const status = (e as ProviderErr).status;
      if (status === 401 || status === 402 || status === 403) { skipKeys.add(key.id); if (status === 401) setStatus(key.id, 'invalid'); log.say('warn', `default key "${key.label}" failed`, 'trying the next default for Text'); log.step('That key did not work. Trying your next one…'); }
      else {
        // A quota or rate limit on one model (free keys often have none for the biggest models) says nothing about the key's smaller models: step down to them.
        tried.add(model.id);
        if (status === 429) { const same = catalog.texts.filter((m) => m.provider === model.provider && m.quality >= model.quality).map((m) => m.id); same.forEach((id) => tried.add(id)); block(same); }
        log.say('warn', `falling back after ${model.id} failed`); log.step('That model did not respond. Trying a lighter one…');
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('I could not finish this one. Try again.');
}
