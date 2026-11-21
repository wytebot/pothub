import type { ProviderErr } from '../models/providers';
import { generateText, rankText, type ChatTurn, type TextModel } from '../models/text';
import { textOf, type Attachment } from './attachments';
import { buildFile, systemPrompt, wantedOutput, type OutFile, type Wanted } from './deliver';
import { buildBundle, bundleSummary } from './bundle';
import { bundleName } from './fileNames';
import { codeContext } from './codeWork';
import { PROVIDERS } from '../models/providerInfo';
import { defaultKeys, getSecret, setStatus, usableKey, type ProviderId } from '../vault/vault';
import { isGatewayRef } from '../models/gatewayRef';
import { getSettings } from '../settings';
import { parseCommands, type Flags } from './commands';
import { refreshCatalog, quickCatalog, type Catalog } from './detect';
import type { RunLog } from './log';
import { NotStarted, addPending, backgroundAvailable, backgroundOn, generateInBackground } from './background';
import { resultsBlock, webResearch, shouldAutoWebSearch, type WebSource } from './search';
import { readyFiles } from './readers';
import { notifyDone } from '../notify';
import { budgetFor, groupByBudget, mapLimit, splitTextIntoChunks, withRetry } from './chunking';

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


/** Parse text controls and refresh the text-model catalog before answering. */
async function prepare(rawPrompt: string, log: RunLog, signal: AbortSignal): Promise<{ text: string; flags: Flags; catalog: Catalog }> {
  log.step('Reading your request…');
  const { text, flags } = parseCommands(rawPrompt);
  const s = log.start('cmd', `pothub parse ${q(text)}${flags.used.length ? ` ${flags.used.join(' ')}` : ''}`);
  log.done(s, 'intent=text');
  log.step('Checking connected text models…');
  const d = log.start('cmd', 'providers detect --text-models');
  const parts: string[] = [];
  const cached = quickCatalog();
  if (cached) {
    log.done(d, `${cached.texts.length} cached text models ready`);
    // Refresh in the background so the next request benefits from fresh provider lists.
    void refreshCatalog({ signal, onProvider: (p, r) => { if (r.source === 'unavailable') parts.push(`${PROVIDERS[p].name} ✕ (${r.reason ?? 'unreachable'})`); else parts.push(`${PROVIDERS[p].name} ✓ ${r.count} text models`); log.update(d, { detail: parts.join(' · ') }); } }).catch(() => {});
    return { text, flags, catalog: cached };
  }
  const catalog = await refreshCatalog({ signal, onProvider: (p, r) => {
    if (r.source === 'unavailable') parts.push(`${PROVIDERS[p].name} ✕ (${r.reason ?? 'unreachable'})`);
    else parts.push(`${PROVIDERS[p].name} ✓ ${r.count} text model${r.count === 1 ? '' : 's'}${r.source === 'cache' ? ' (cached)' : ''}`);
    log.update(d, { detail: parts.join('  ·  ') });
  } });
  log.done(d, `${catalog.texts.length} text models ready${catalog.unverified.length ? ` · ${catalog.unverified.map((x) => PROVIDERS[x].name).join(', ')} unverified` : ''}`);
  return { text, flags, catalog };
}

/** Lists only the text models available to the user's configured providers. */
export async function runInfo(rawPrompt: string, log: RunLog, signal: AbortSignal): Promise<boolean> {
  if (!parseCommands(rawPrompt).flags.models) return false;
  const { catalog } = await prepare(rawPrompt, log, signal);
  for (const m of catalog.texts) log.say('info', `text ${m.id}`, m.name);
  if (!catalog.texts.length) log.say('warn', 'no text models available', 'add a supported text-provider key in AI Providers');
  return true;
}


export interface TextOutcome { text: string; model: TextModel; file: OutFile | null; notes: string[]; /** sites the web research drew on; only present when web results were actually used */ sources?: WebSource[]; }
/** Text models that answered last time, and ones that hit a quota recently, so the next request starts with what works. */
const GOOD = 'agent.text.good.v1'; const BLOCKED = 'agent.text.blocked.v1'; const BLOCK_MS = 45 * 60_000;
const readJson = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T; } catch { return d; } };
const goodModel = (): string | undefined => readJson<{ id?: string }>(GOOD, {}).id;
const saveGood = (id: string) => { try { localStorage.setItem(GOOD, JSON.stringify({ id })); } catch { /* storage blocked */ } };
const blockedNow = (): Set<string> => { const all = readJson<Record<string, number>>(BLOCKED, {}); const now = Date.now(); return new Set(Object.entries(all).filter(([, t]) => t > now).map(([id]) => id)); };
const block = (ids: string[]) => { try { const all = readJson<Record<string, number>>(BLOCKED, {}); const now = Date.now(); for (const k of Object.keys(all)) if (all[k] <= now) delete all[k]; for (const id of ids) all[id] = now + BLOCK_MS; localStorage.setItem(BLOCKED, JSON.stringify(all)); } catch { /* storage blocked */ } };
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });


// Large sources (see chunking.ts). A source that fits the provider's context is read WHOLE, with no extra requests.
// Only a source that does not fit is split into big segments, analysed several at a time, and merged only if the
// findings still would not fit. Every segment is always read; nothing is skipped or truncated.
export { splitTextIntoChunks };
const CONTEXT_ERR = /token|context|too (long|large)|exceed|maximum|limit/i;
const temporary = (e: unknown) => { const s = (e as ProviderErr).status; return s === 429 || s === 500 || s === 502 || s === 503 || s === 504; };

async function chunkLargeTextFiles(files: Attachment[], provider: ProviderId, secret: string, model: TextModel,
  signal: AbortSignal, log: RunLog, forceSplit = false): Promise<{ files: Attachment[]; evidence: string[]; notes: string[] }> {
  const prepared: Attachment[] = []; const evidence: string[] = []; const notes: string[] = [];
  const b = budgetFor(provider);
  // Total characters that may travel whole. After a "too large" refusal from the provider, drop to one segment's worth.
  const limit = forceSplit ? b.chunk : b.direct; let whole = 0;
  for (const file of files) {
    if (file.kind !== 'text' && file.kind !== 'docx') { prepared.push(file); continue; }
    const source = await textOf(file);
    if (whole + source.length <= limit) { whole += source.length; prepared.push(file); evidence.push(`Source ${file.name}:\n${source}`); continue; }
    const chunks = splitTextIntoChunks(source, b.chunk, b.overlap);
    log.step(`${file.name} is larger than one request can hold: reading all ${chunks.length} part${chunks.length === 1 ? '' : 's'}, ${Math.min(b.parallel, chunks.length)} at a time…`);
    let done = 0;
    const summaries = await mapLimit(chunks, b.parallel, async (part, i) => {
      if (signal.aborted) throw new Error('Cancelled.');
      const r = await withRetry(() => generateText(provider, secret, {
        model: model.id,
        system: 'You are a careful source-analysis agent. Extract all relevant facts, figures, names, dates, requirements, decisions, and caveats from this source segment. Preserve exact values, file paths, identifiers, and any code that would be needed to edit or reproduce the source. Distinguish explicit facts from uncertainty. Do not invent missing context. Include a short segment locator.',
        history: [], prompt: `File: ${file.name}\nSegment ${i + 1} of ${chunks.length}\n\n${part}`,
        files: [], signal,
      }), temporary);
      log.step(`${file.name}: part ${++done} of ${chunks.length} read`);
      return `SEGMENT ${i + 1}/${chunks.length}\n${r.text}`;
    });
    // Merge only while the findings still would not fit in one segment's worth of text. Groups are packed by size
    // and condensed in parallel; a group of one is passed through untouched (no request).
    let level = summaries; let round = 0;
    while (level.length > 1 && level.join('\n\n').length > b.chunk && round < 4) {
      const groups = groupByBudget(level, b.chunk);
      if (groups.length >= level.length) break; // nothing can be packed together any further
      level = await mapLimit(groups, b.parallel, async (group, gi) => {
        if (group.length === 1) return group[0];
        if (signal.aborted) throw new Error('Cancelled.');
        const reduced = await withRetry(() => generateText(provider, secret, {
          model: model.id, history: [], files: [], signal,
          system: 'You are consolidating source-analysis records. Preserve every distinct fact, exact number, date, name, requirement, decision, exception, contradiction, uncertainty, and source locator. Merge duplicates only when they are genuinely identical. Never discard a unique detail or invent missing facts. Organize compactly by topic and retain segment references.',
          prompt: `File: ${file.name}\nConsolidation round ${round + 1}; group ${gi + 1} of ${groups.length}\n\n${group.join('\n\n')}`,
        }), temporary);
        log.step(`${file.name}: condensing findings (round ${round + 1}, group ${gi + 1} of ${groups.length})`);
        return reduced.text;
      });
      round++;
    }
    const consolidated = level.join('\n\n').trim() || 'No extractable text was returned by the analysis provider.';
    const sourceEvidence = `Complete source processed: ${file.name} (${source.length.toLocaleString()} characters; ${chunks.length} overlapping segments).\nConsolidated segment findings (all segments were submitted):\n${consolidated}`;
    evidence.push(sourceEvidence); whole += sourceEvidence.length;
    
    prepared.push({ ...file, kind: 'text', mime: 'text/plain', size: sourceEvidence.length,
      blob: new Blob([sourceEvidence], { type: 'text/plain' }) });
  }
  return { files: prepared, evidence, notes };
}


/** Builds the file a request asked for (zip, Word, PDF, ...) from the finished answer. Also used when a background job finishes after the app was reopened. */
export async function deliverable(text: string, wanted: Wanted, prompt: string, inputs: Attachment[], log?: RunLog): Promise<{ file: OutFile | null; notes: string[] }> {
  const notes: string[] = []; let file: OutFile | null = null;
  if (!wanted.file) return { file, notes };
  log?.step(wanted.format === 'zip' ? 'Packaging the ZIP…' : 'Preparing your file…');
  try {
    if (wanted.format === 'zip') {
      // attached files travel with the new ones when the request says "with these / my files"
      const keep = inputs.length > 0 && /\b(with|including|plus|and)\b[^.?!\n]{0,40}\b(these|them|my|attached|uploaded|files?)\b/i.test(prompt);
      const extra = keep ? await Promise.all(inputs.map(async (f) => ({ path: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) }))) : [];
      const b = await buildBundle(text, bundleName({ prompt, reply: text, inputs }), extra);
      if (b) { file = { blob: b.blob, name: b.name, mime: 'application/zip' }; notes.push(...b.notes); log?.say('ok', 'zip ready', bundleSummary(b.files)); }
    } else file = await buildFile(text, wanted, prompt, inputs);
  } catch { notes.push('The answer is above, but I could not build the file this time. You can copy it from the chat.'); }
  return { file, notes };
}

/**
 * Chat, writing, analysis, coding and documents. Picks the best ready text model for the files and the request,
 * streams the answer as it is written, falls back to another model or key if one fails, and builds a file when the person asked for one.
 */
export async function runText(o: { prompt: string; files: Attachment[]; history: ChatTurn[]; prefer: 'quality' | 'speed'; signal: AbortSignal; log: RunLog; onText: (soFar: string) => void; /** Text-only attachment analysis. */ web?: boolean; /** where the answer belongs, so a background job can be picked up again after the app was closed */ job?: { chatId: string; msgId: string } }): Promise<TextOutcome> {
  const { log, signal } = o;
  const { text, flags, catalog } = await prepare(o.prompt, log, signal);
  if (!text && !o.files.length) throw new Error('Type your question or request first (commands alone are not a prompt).');
  const prompt = text || (o.files.length ? 'Describe and summarise the attached file(s) in detail.' : 'The person attached file(s) but did not write a message.');
  const wanted = wantedOutput(prompt, codeContext(o.history, { hasFiles: o.files.length > 0 })); const notes: string[] = [];
  if (wanted.note) notes.push(wanted.note);
  // Mandatory web research: search and crawl first, then hand the findings to the model with the question.
  // Nothing about the search is added to the reply text. When it was used, the source sites are shown under the
  // answer (`sources`); when it was not (nothing found, or it failed), the answer is simply written without it.
  let sent = prompt; let webBlock = ''; let webSources: WebSource[] = [];
  if (shouldAutoWebSearch(prompt) && !wanted.code && !o.files.length) {
    log.step('Searching the web…');
    try {
      const q = prompt.replace(/\s+/g, ' ').slice(0, 200); const found = await webResearch(q);
      if (found.hits.length) {
        webBlock = resultsBlock(q, found, today()); webSources = found.sources;
        sent = `${prompt}

Use the web results below for current facts. Answer directly and concisely. Do not add a sources list or link icons; do not invent facts.

---
${webBlock}`;
        const read = found.hits.filter((h) => h.text).length; const deep = found.hits.filter((h) => h.via).length;
        log.say('ok', 'web search', `${found.hits.length} result(s), ${read} page(s) read${deep ? `, ${deep} followed from those sites` : ''}${found.updates.length ? `, ${found.updates.length} recent update(s)` : ''}`);
      }
    } catch (e) { log.say('warn', 'web search failed', msg(e)); }
  }
  // Every file is made readable on this device first (documents, sheets, slides, archives, unknown formats...), before any provider is chosen.
  let files = o.files;
  if (files.length) {
    const hasZip = files.some((f) => /\.(zip|tar|tgz|gz)$/i.test(f.name));
    const codeChange = /\b(fix|debug|repair|update|edit|amend|refactor|wire|implement|change|remove|add)\b/i.test(prompt);
    if (hasZip && codeChange) log.step('Stripping off the ZIP archive…');
    if (hasZip && codeChange) log.step('Detecting the affected files…');
    else log.step('Reading your files…');
    const ready = await readyFiles(files, { step: (s) => log.step(s) });
    files = ready.files; notes.push(...ready.notes);
    if (hasZip && codeChange) log.step('Planning the solution from the extracted project…');
  }
  const pref = flags.prefer ?? o.prefer;
  const skipKeys = new Set<string>(); const tried = new Set<string>(); let lastErr: unknown; let partial = '';
  // The whole conversation is sent. Only if a model says it cannot hold that much do the oldest turns step aside, and the person is told.
  let history = o.history; let trimmed = false;
  // Set when a provider refuses a request as too large: from then on big files are read in parts instead of whole.
  let forceSplit = false;

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
      // Sources that fit the provider are read whole; larger ones are analysed in big parallel parts, and the
      // final writer receives the complete set of findings, not a truncated prefix.
      const chunked = files.length ? await chunkLargeTextFiles(files, model.provider, secret, model, signal, log, forceSplit) : { files, evidence: [] as string[], notes: [] as string[] };
      notes.push(...chunked.notes);
      const req = { model: model.id, system: systemPrompt(wanted, { today: today(), hasFiles: files.length > 0, web: !!webBlock }), history, prompt: sent, files: chunked.files, signal, onText: (t: string) => { partial = t; o.onText(t); } };
      // Jobs run on the Pothub server when they can, so they finish even if the app is closed. If the server cannot take the job, it runs on this device.
      let out: Awaited<ReturnType<typeof generateText>>;
      if (o.job && backgroundOn() && backgroundAvailable() && !isGatewayRef(secret)) {
        const job = o.job;
        try { out = await generateInBackground(model.provider, secret, req, { msgId: job.msgId, onStarted: (id: string) => { addPending({ id, chatId: job.chatId, msgId: job.msgId, prompt, wanted, modelName: model.name, notes: [...notes], sources: webSources.length ? webSources : undefined, started: Date.now() }); log.step('Running in the background…'); } }); }
        catch (e) { if (!(e instanceof NotStarted)) throw e; log.say('warn', 'background run unavailable', e.message); out = await generateText(model.provider, secret, req); }
      } else out = await generateText(model.provider, secret, req);
      log.done(g, `${out.text.length.toLocaleString()} characters · ${secs(Date.now() - t0)}`);
      if (out.unread.length) notes.push(`${model.name} cannot read ${out.unread.join(', ')}, so ${out.unread.length > 1 ? 'those were' : 'it was'} left out. Attach a text-based document or source file for text analysis.`);
      if (out.truncated) notes.push('The answer reached the model\'s length limit. Ask me to continue and I will pick up from here.');
      if (trimmed) notes.push('This conversation is longer than the model can hold at once, so the oldest messages were left out of this reply.');
      const delivered = await deliverable(out.text, wanted, prompt, o.files, log); notes.push(...delivered.notes); const file = delivered.file;
      saveGood(model.id);
      void notifyDone({ kind: 'text', title: file ? 'Your answer and file are ready' : 'Your answer is ready', body: `${model.name} finished “${q(prompt, 60).slice(1, -1)}”.`, route: '/' });
      return { text: out.text, model, file, notes, ...(webSources.length ? { sources: webSources } : {}) };
    } catch (e) {
      lastErr = e; log.fail(g, msg(e));
      const scope = fallbackScope(e); if (scope === 'none') throw e;
      // Most of the answer already arrived and then the connection dropped: keep what we have instead of starting over.
      if (partial.length > 400) { log.say('warn', 'kept the partial answer'); return { text: partial, model, file: null, notes: [...notes, 'The connection dropped near the end, so this answer may be cut short. Ask me to continue and I will pick up from here.'], ...(webSources.length ? { sources: webSources } : {}) }; }
      const status = (e as ProviderErr).status;
      if (status === 400 && history.length > 2 && /token|context|too (long|large)|exceed|maximum|limit/i.test(msg(e))) {
        history = history.slice(Math.max(2, Math.ceil(history.length / 2) & ~1)); trimmed = true; log.say('warn', 'conversation too long for this model', 'leaving out the oldest messages');
        continue;
      }
      if (status === 400 && !forceSplit && CONTEXT_ERR.test(msg(e)) && files.reduce((n, f) => n + (f.kind === 'text' || f.kind === 'docx' ? f.size : 0), 0) > budgetFor(model.provider).chunk) {
        forceSplit = true; log.say('warn', 'files too large to send whole', 'reading them in parts instead'); continue;
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
