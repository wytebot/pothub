import { call, failure, generateImages, type GenImage, type ProviderErr } from '../models/providers';
import { generateText, rankText, type ChatTurn, type TextModel } from '../models/text';
import { base64Of, textOf, type Attachment } from './attachments';
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
import { resultsBlock, webSearch, webRemaining, shouldAutoWebSearch } from './search';
import { readyFiles } from './readers';

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

export async function runImage(o: { /** the caller already decided this is an image request */ routed?: boolean; /** photos added with the + button: they are edited or used as a reference */ refs?: Attachment[]; prompt: string; count: number; format: string; prefer: 'quality' | 'speed'; model: string; signal: AbortSignal; log: RunLog}): Promise<ImageResult> {
  const { log, signal } = o;
  const { text, flags, catalog } = await prepare(o.prompt, log, signal);
  if (!text) throw new Error('Describe the image first (commands alone are not a prompt).');
  const count = flags.count ?? o.count;
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
      if (made.length !== count || made.some((m) => m.blob.size <= 0 || !m.mime.startsWith('image/'))) throw new Error('The image provider returned an incomplete or invalid image. No incomplete result was delivered.');
      log.step('Checking the generated image files…');
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
export async function runVideoStart(o: { prompt: string; modelId: string; signal: AbortSignal; log: RunLog }): Promise<VideoStart> {
  const { log, signal } = o;
  const { text, flags, catalog } = await prepare(o.prompt, log, signal);
  if (!text) throw new Error('Describe the video first (commands alone are not a prompt).');
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


// Provider context limits vary. Keep each extracted-text segment comfortably below common
// request limits, overlap boundaries so sentences are not lost, and process every segment.
const CHUNK_CHARS = 28_000;
const CHUNK_OVERLAP = 900;
export function splitTextIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_CHARS) return [text];
  const chunks: string[] = []; let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + CHUNK_CHARS);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('. ', end), text.lastIndexOf(' ', end - 500));
      if (boundary > start + CHUNK_CHARS * 0.65) end = boundary + 1;
    }
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

async function chunkLargeTextFiles(files: Attachment[], provider: ProviderId, secret: string, model: TextModel,
  signal: AbortSignal, log: RunLog): Promise<{ files: Attachment[]; evidence: string[]; notes: string[] }> {
  const prepared: Attachment[] = []; const evidence: string[] = []; const notes: string[] = [];
  for (const file of files) {
    if (file.kind !== 'text' && file.kind !== 'docx') { prepared.push(file); continue; }
    const source = await textOf(file);
    const chunks = splitTextIntoChunks(source);
    if (chunks.length === 1) { prepared.push(file); evidence.push(`Source ${file.name}:\n${source}`); continue; }
    log.step(`Processing ${file.name} in ${chunks.length} overlapping chunks…`);
    const summaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (signal.aborted) throw new Error('Cancelled.');
      const part = await generateText(provider, secret, {
        model: model.id,
        system: 'You are a careful source-analysis agent. Extract all relevant facts, figures, names, dates, requirements, decisions, and caveats from this source segment. Preserve exact values and distinguish explicit facts from uncertainty. Do not invent missing context. Include a short segment locator.',
        history: [], prompt: `File: ${file.name}\nSegment ${i + 1} of ${chunks.length}\n\n${chunks[i]}`,
        files: [], signal,
      });
      summaries.push(`SEGMENT ${i + 1}/${chunks.length}\n${part.text}`);
      log.step(`${file.name}: verified segment ${i + 1} of ${chunks.length}`);
    }
    // Hierarchical consolidation keeps every source segment in the review path without
    // sending an unbounded pile of summaries into one provider context window.
    let level = summaries;
    let round = 0;
    while (level.length > 1) {
      const next: string[] = [];
      for (let at = 0; at < level.length; at += 5) {
        if (signal.aborted) throw new Error('Cancelled.');
        const group = level.slice(at, at + 5);
        const reduced = await generateText(provider, secret, {
          model: model.id, history: [], files: [], signal,
          system: 'You are consolidating source-analysis records. Preserve every distinct fact, exact number, date, name, requirement, decision, exception, contradiction, uncertainty, and source locator. Merge duplicates only when they are genuinely identical. Never discard a unique detail or invent missing facts. Organize compactly by topic and retain segment references.',
          prompt: `File: ${file.name}\nConsolidation round ${round + 1}; group ${Math.floor(at / 5) + 1}\n\n${group.join('\n\n')}`,
        });
        next.push(reduced.text);
        log.step(`${file.name}: consolidating source findings (${next.length} groups complete)`);
      }
      level = next; round++;
    }
    const consolidated = level[0] ?? 'No extractable text was returned by the analysis provider.';
    const sourceEvidence = `Complete source processed: ${file.name} (${source.length.toLocaleString()} characters; ${chunks.length} overlapping segments).\nConsolidated segment findings (all segments were submitted):\n${consolidated}`;
    evidence.push(sourceEvidence);
    prepared.push({ ...file, kind: 'text', mime: 'text/plain', size: sourceEvidence.length,
      blob: new Blob([sourceEvidence], { type: 'text/plain' }) });
  }
  return { files: prepared, evidence, notes };
}

/**
 * Chat, writing, analysis, coding and documents. Picks the best ready text model for the files and the request,
 * streams the answer as it is written, falls back to another model or key if one fails, and builds a file when the person asked for one.
 */
export async function runText(o: { prompt: string; files: Attachment[]; history: ChatTurn[]; prefer: 'quality' | 'speed'; signal: AbortSignal; log: RunLog; onText: (soFar: string) => void; /** free file analysis is used up: these files are NOT read, and the answer must say so */ blocked?: { names: string[]; back: string }; /** When true, search the web before generating the response; plan quotas still apply. */ web?: boolean }): Promise<TextOutcome> {
  const { log, signal } = o;
  const { text, flags, catalog } = await prepare(o.prompt, log, signal);
  if (!text && !o.files.length && !o.blocked) throw new Error('Type your question or request first (commands alone are not a prompt).');
  const prompt = text || (o.files.length ? 'Describe and summarise the attached file(s) in detail.' : 'The person attached file(s) but did not write a message.');
  const wanted = wantedOutput(prompt); const notes: string[] = [];
  if (wanted.note) notes.push(wanted.note);
  if (webRemaining() <= 0) notes.push('You have used today’s free web-search allowance. This response cannot include fresh web results until the allowance resets; Premium includes unlimited web research.');
  if (o.blocked) notes.push(`File analysis limit reached: I could not read ${o.blocked.names.slice(0, 3).join(', ')}${o.blocked.names.length > 3 ? ` and ${o.blocked.names.length - 3} more` : ''}. Free file analysis returns at ${o.blocked.back}. Premium has no limit.`);
  // Mandatory web research: look it up first and hand the results to the model with the question.
  let sent = prompt;
  if (shouldAutoWebSearch(prompt) && webRemaining() > 0) {
    log.step('Searching the web…');
    try {
      const q = prompt.replace(/\s+/g, ' ').slice(0, 200); const hits = await webSearch(q);
      if (hits.length) { sent = `${prompt}\n\nFor this web-researched answer, give a thorough, well-structured response that directly answers the request. Separate verified facts from estimates or uncertainty, include relevant dates, compare useful details, and cite the supplied source URLs inline. Do not invent sources or facts.\n\n---\n${resultsBlock(q, hits, today())}`; notes.push('Searched the web.'); log.say('ok', 'web search', `${hits.length} result(s)`); }
      else { notes.push('Web search found nothing useful, so this answer does not include live results.'); }
    } catch (e) { log.say('warn', 'web search failed', msg(e)); notes.push(/free web searches|daily research limit|free web-search allowance/i.test(msg(e)) ? msg(e) : 'Web search was not available this time, so this answer does not include live results.'); }
  }
  // Every file is made readable on this device first (documents, sheets, slides, archives, unknown formats...), before any provider is chosen.
  let files = o.files;
  if (files.length) {
    const hasZip = files.some((f) => /\.(zip|tar|tgz|gz)$/i.test(f.name));
    const codeChange = /\b(fix|debug|repair|update|edit|amend|refactor|wire|implement|change|remove|add)\b/i.test(prompt);
    if (hasZip && codeChange) log.step('Stripping off the ZIP archive…');
    if (hasZip && codeChange) log.step('Detecting the affected files…');
    else log.step('Reading your files…');
    const ready = await readyFiles(files, { nativeMedia: defaultKeys('text').some((k) => k.provider === 'gemini'), step: (s) => log.step(s) });
    files = ready.files; notes.push(...ready.notes);
    if (hasZip && codeChange) log.step('Planning the solution from the extracted project…');
  }
  const pref = flags.prefer ?? o.prefer;
  const skipKeys = new Set<string>(); const tried = new Set<string>(); let lastErr: unknown; let partial = '';
  // The whole conversation is sent. Only if a model says it cannot hold that much do the oldest turns step aside, and the person is told.
  let history = o.history; let trimmed = false;

  for (let attempt = 0, max = Math.min(10, 6 + defaultKeys('text').length) + 6; attempt < max; attempt++) {
    log.step(attempt === 0 ? 'Choosing the best text model…' : 'Trying another model…');
    const live = new Set(defaultKeys('text', skipKeys).map((k) => k.provider));
    const usable = catalog.texts.filter((m) => live.has(m.provider) && !tried.has(m.id)); const cool = blockedNow();
    const pool = usable.filter((m) => !cool.has(m.id)).length ? usable.filter((m) => !cool.has(m.id)) : usable;
    const r = log.start('cmd', `pothub route --task text --prefer ${pref}${files.length ? ` --files ${files.length}` : ''}`);
    const ranked = rankText(pool, pref, { kinds: files.map((f) => f.kind) });
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

    log.step(files.length ? (/\.(zip|tar|tgz|gz)$/i.test(o.files.map((f) => f.name).join(' ')) && /\b(fix|debug|repair|update|edit|amend|refactor|wire|implement|change|remove|add)\b/i.test(prompt) ? 'Applying the fixes and amending other affected files…' : 'Preparing your files and solution…') : wanted.file ? `Writing your ${wanted.format === 'docx' ? 'document' : 'file'}…` : 'Writing your answer…');
    const g = log.start('cmd', `${model.id} generate ${q(prompt, 40)}`); const t0 = Date.now(); partial = '';
    try {
      // Large text documents are summarized in ordered, overlapping provider-sized chunks;
      // the final writer receives the complete set of segment findings, not a truncated prefix.
      const chunked = files.length ? await chunkLargeTextFiles(files, model.provider, secret, model, signal, log) : { files, evidence: [] as string[], notes: [] as string[] };
      notes.push(...chunked.notes);
      const out = await generateText(model.provider, secret, { model: model.id, system: systemPrompt(wanted, { today: today(), hasFiles: files.length > 0, blockedFiles: o.blocked?.names, web: !!o.web }), history, prompt: sent, files: chunked.files, signal, onText: (t) => { partial = t; o.onText(t); } });
      log.done(g, `${out.text.length.toLocaleString()} characters · ${secs(Date.now() - t0)}`);
      // Independent quality-control pass before any text deliverable is released.
      log.step(files.length ? 'Fact-checking the draft against the supplied sources…' : 'Checking the result against your exact request…');
      const evidence = chunked.evidence.join('\n\n');
      try {
        const review = await generateText(model.provider, secret, {
          model: model.id,
          system: files.length
            ? 'You are an independent fact-checking agent. Treat supplied source evidence as authoritative. Check every concrete claim, number, date, name, quotation, and conclusion in the draft. Correct unsupported or contradicted claims, preserve correct useful content, and clearly label any point the sources cannot establish. Do not claim to have verified facts absent from the evidence. Return the complete corrected draft only.'
            : `You are an independent quality-assurance agent. Compare the draft with the exact user request. Check that it performs the requested task, uses the requested output format and language, follows constraints, is complete, internally consistent, and does not drift into unrelated material. Review factual claims for obvious errors and unsupported certainty; do not invent external verification. Correct problems while preserving useful content. ${wanted.format === 'zip' ? 'For ZIP deliverables, preserve every === FILE: path === and === END FILE === marker exactly, preserve paths, and do not omit or shorten file contents.' : ''} Return the complete improved draft only.`,
          history: [],
          prompt: `User request: ${prompt}\n\nSOURCE EVIDENCE:\n${files.length ? evidence || '[Some source formats could not be read; state limitations rather than inventing verification.]' : '[No source files were supplied. Do not claim external fact-checking.]'}\n\nDRAFT TO CHECK:\n${out.text}`,
          files: chunked.files, signal,
        });
        if (!review.text.trim()) throw new Error('The reviewer returned an empty result.');
        out.text = review.text; partial = review.text; o.onText(review.text);
        log.say('ok', files.length ? 'source fact-check complete' : 'quality check complete', 'reviewed before delivery');
      } catch (e) {
        if (isCancel(e)) throw e;
        notes.push('The independent quality-check pass could not finish, so the draft is delivered without a completed second review. Please review important details before relying on it.');
        log.say('warn', 'quality check unavailable', msg(e));
      }
      if (out.unread.length) notes.push(`${model.name} cannot read ${out.unread.join(', ')}, so ${out.unread.length > 1 ? 'those were' : 'it was'} left out. Add a Google Gemini key for Text & documents to include videos and audio.`);
      if (out.truncated) notes.push('The answer reached the model\'s length limit. Ask me to continue and I will pick up from here.');
      if (trimmed) notes.push('This conversation is longer than the model can hold at once, so the oldest messages were left out of this reply.');
      let file: OutFile | null = null;
      if (wanted.file) {
        log.step(wanted.format === 'zip' ? 'Packaging the ZIP…' : 'Preparing your file…');
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
      if (status === 400 && history.length > 2 && /token|context|too (long|large)|exceed|maximum|limit/i.test(msg(e))) {
        history = history.slice(Math.max(2, Math.ceil(history.length / 2) & ~1)); trimmed = true; log.say('warn', 'conversation too long for this model', 'leaving out the oldest messages');
        continue;
      }
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
