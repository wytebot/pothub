// Runs the person's configured text models for repository work: picks a model, falls back to another one when it fails,
// and sends large sets of files in parts so no provider is asked to take more than it can hold.
import { generateText, rankText, codeMaxTokens, type TextModel } from '../models/text';
import type { ChatTurn } from '../models/text';
import type { ProviderErr } from '../models/providers';
import { quickCatalog, refreshCatalog } from '../agent/detect';
import { defaultKeys, getSecret, setStatus, usableKey } from '../vault/vault';
import { getSettings } from '../settings';
import { PROVIDERS } from '../models/providerInfo';
import { groupByBudget, mapLimit, splitTextIntoChunks } from '../agent/chunking';
import type { RunLog } from '../agent/log';

export class TooLarge extends Error { constructor(m: string) { super(m); this.name = 'TooLarge'; } }
const CONTEXT_ERR = /token|context|too (long|large)|exceed|maximum|limit|payload|entity/i;
const cancelled = () => new Error('Cancelled.');
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const key = (m: TextModel) => `${m.provider}::${m.id}`;
let lastGood = '';

export interface Ask { system: string; prompt: string; history?: ChatTurn[]; signal: AbortSignal; log: RunLog; onText?: (soFar: string) => void; code?: boolean; long?: boolean; role?: string }
export interface Answer { text: string; model: TextModel; truncated: boolean }

/** One answer from the best available configured model; another model or key is tried when one fails. */
export async function askAgent(o: Ask): Promise<Answer> {
  const { log, signal } = o;
  const catalog = quickCatalog() ?? await refreshCatalog({ signal });
  const skipKeys = new Set<string>(); const tried = new Set<string>(); let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (signal.aborted) throw cancelled();
    const live = new Set(defaultKeys('text', skipKeys).map((k) => k.provider));
    const usable = catalog.texts.filter((m) => live.has(m.provider) && !tried.has(key(m)));
    const ranked = rankText(usable, getSettings().priority);
    const want = getSettings().textModel !== 'auto' ? getSettings().textModel : '';
    const wantId = want.includes('::') ? want.slice(want.indexOf('::') + 2) : want;
    const model = (wantId && ranked.find((m) => m.id === wantId)) || ranked.find((m) => key(m) === lastGood) || ranked[0];
    if (!model) {
      if (lastErr instanceof Error) throw lastErr;
      throw new Error('No text model is available on your connected keys. Add a key in AI Providers and tick it as default for Text & documents.');
    }
    const k = usableKey(model.provider, 'text', skipKeys);
    if (!k) { tried.add(key(model)); continue; }
    let secret: string;
    try { secret = await getSecret(k.id); } catch (e) { skipKeys.add(k.id); lastErr = e; continue; }
    // The timeline shows which agent (model) is working and what it is doing, with a live count while it writes.
    const role = o.role || 'working';
    const agent = log.start('agent', model.name, `${PROVIDERS[model.provider].name} · ${role}`);
    let lastTick = 0;
    const tick = (soFar: string) => { const now = Date.now(); if (now - lastTick > 400) { lastTick = now; log.update(agent, { detail: `${PROVIDERS[model.provider].name} · ${role} · ${soFar.length.toLocaleString()} characters` }); } o.onText?.(soFar); };
    try {
      const r = await generateText(model.provider, secret, { model: model.id, system: o.system, history: o.history ?? [], prompt: o.prompt, files: [], signal, onText: tick, ...(o.code || o.long ? { maxTokens: codeMaxTokens(model.provider) } : {}) });
      lastGood = key(model);
      log.done(agent, `${PROVIDERS[model.provider].name} · ${role} · ${r.text.length.toLocaleString()} characters`);
      return { text: r.text, model, truncated: r.truncated };
    } catch (e) {
      log.fail(agent, msg(e).slice(0, 120));
      lastErr = e;
      if (signal.aborted || msg(e) === 'Cancelled.') throw cancelled();
      const status = (e as ProviderErr).status;
      if ((status === 400 || status === 413) && CONTEXT_ERR.test(msg(e))) throw new TooLarge(msg(e));
      if (/safety|blocked/i.test(msg(e))) throw e;
      if (status === 401 || status === 402 || status === 403 || status === 429) {
        skipKeys.add(k.id); if (status === 401) setStatus(k.id, 'invalid');
        log.say('warn', `${PROVIDERS[model.provider].name} key failed (${status})`, 'trying another key or provider');
      } else { tried.add(key(model)); log.say('warn', `${model.name} did not answer`, 'trying another model'); }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No model answered. Try again in a moment.');
}

export interface Block { path: string; text: string }
const render = (b: Block, part = '') => `=== ${b.path}${part} ===\n${b.text}`;

/** Packs files into pieces of at most `size` characters; a file larger than that is split into labelled parts. Every character is kept. */
export function packBlocks(blocks: Block[], size: number): string[] {
  const items: string[] = [];
  for (const b of blocks) {
    if (b.text.length + b.path.length + 12 <= size) { items.push(render(b)); continue; }
    const parts = splitTextIntoChunks(b.text, Math.max(1_000, size - b.path.length - 40), 400);
    parts.forEach((p, i) => items.push(render({ path: b.path, text: p }, ` (part ${i + 1} of ${parts.length})`)));
  }
  return groupByBudget(items, size).map((g) => g.join('\n\n'));
}

export const LIMITS = { direct: 70_000, chunk: 30_000 };

/**
 * Answers a question about many files. Small sets go in one request. Larger sets (or any set a provider refuses as too large)
 * are read in parts, a few at a time, each part reduced to notes about the question, and the final answer is written from the notes.
 */
export async function askOverFiles(o: Omit<Ask, 'prompt'> & { blocks: Block[]; header: string; mapTask: string; final: string }): Promise<Answer & { chunked: boolean }> {
  const { log } = o;
  const total = o.blocks.reduce((n, b) => n + b.text.length + b.path.length, 0);
  const ask = (system: string, prompt: string, stream = false, role?: string) => askAgent({ ...o, system, prompt, onText: stream ? o.onText : undefined, ...(role ? { role } : {}) });
  let direct = total <= LIMITS.direct;
  if (direct) {
    const s = log.start('cmd', `send ${o.blocks.length} files · ${Math.ceil(total / 1000)}k chars in one request`);
    try { const r = await ask(o.system, `${o.header}\n\n${packBlocks(o.blocks, Infinity)[0] ?? ''}\n\n${o.final}`, true, 'writing the explanation'); log.done(s, r.model.name); return { ...r, chunked: false }; }
    catch (e) { if (!(e instanceof TooLarge)) { log.fail(s, msg(e)); throw e; } log.fail(s, 'too large for one request'); direct = false; }
  }
  let size = LIMITS.chunk; let notes: string[] = []; const seen: { model?: TextModel } = {};
  for (let round = 0; round < 3; round++) {
    const pieces = packBlocks(o.blocks, size);
    const s = log.start('cmd', `read ${pieces.length} part${pieces.length === 1 ? '' : 's'} · ${Math.round(size / 1000)}k chars each · 2 at a time`);
    try {
      let done = 0;
      notes = await mapLimit(pieces, 2, async (piece, i) => {
        const r = await ask(`${o.system}\n\nYou are reading part ${i + 1} of ${pieces.length} of the repository material. Report only what matters for the task; do not write the final answer yet.`,
          `${o.header}\n\nTask for this part: ${o.mapTask}\n\n${piece}`, false, `reading part ${i + 1} of ${pieces.length}`);
        seen.model = r.model; log.update(s, { detail: `${++done}/${pieces.length} read` });
        return `--- notes from part ${i + 1}/${pieces.length} ---\n${r.text}`;
      });
      log.done(s, seen.model?.name); break;
    } catch (e) {
      if (e instanceof TooLarge && round < 2) { log.fail(s, 'still too large'); size = Math.floor(size / 2); continue; }
      log.fail(s, msg(e)); throw e;
    }
  }
  // Notes that still do not fit are condensed in parallel groups first.
  let joined = notes.join('\n\n');
  if (joined.length > LIMITS.direct) {
    const groups = groupByBudget(notes, LIMITS.chunk);
    const s = log.start('cmd', `condense ${notes.length} notes in ${groups.length} groups`);
    const cond = await mapLimit(groups, 2, async (g) => (await ask(o.system, `Merge these notes into shorter notes. Keep every file path, line, error and exact name.\n\n${g.join('\n\n')}`, false, 'condensing notes')).text);
    log.done(s); joined = cond.join('\n\n');
  }
  const s = log.start('cmd', 'write the answer from the notes');
  const r = await ask(o.system, `${o.header}\n\nNotes from reading every part of the repository material:\n\n${joined}\n\n${o.final}`, true, 'writing the explanation');
  log.done(s, r.model.name);
  return { ...r, chunked: true };
}
