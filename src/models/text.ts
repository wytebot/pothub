import type { ProviderId } from '../vault/vault';
import { base64Of, textOf, type AttachKind, type Attachment } from '../agent/attachments';
import { call, canStream, failure, perr, type ProviderErr } from './http';

export interface TextModel { id: string; provider: ProviderId; name: string; speed: 1 | 2 | 3; quality: 1 | 2 | 3; }
export interface ChatTurn { role: 'user' | 'assistant'; text: string; }
export interface TextRequest { model: string; system: string; history: ChatTurn[]; prompt: string; files: Attachment[]; signal?: AbortSignal; /** longest single reply in tokens */ maxTokens?: number; /** called with everything written so far while the answer arrives */ onText?: (soFar: string) => void; }
export interface TextResult { text: string; /** true when the provider still stopped at its length limit after every continuation */ truncated: boolean; unread: string[]; }
export interface ListedLike { id: string; methods: string[]; }

/** What each provider can read directly. Everything else is turned into text first, or skipped with a friendly note. */
const NATIVE: Partial<Record<ProviderId, AttachKind[]>> = { gemini: ['image', 'video', 'audio', 'pdf'], openai: ['image', 'pdf'], xai: ['image'] };
export const nativeKinds = (p: ProviderId): AttachKind[] => NATIVE[p] ?? [];
/** Files this provider cannot make use of at all (a video sent to a provider that only reads text, for example). */
export const unreadable = (p: ProviderId, files: Attachment[]) => files.filter((f) => !['text', 'docx'].includes(f.kind) && !nativeKinds(p).includes(f.kind));

// ---------------------------------------------------------------- choosing a model from the provider's own live list
const NOT_CHAT = /(image|imagen|veo|tts|audio|speech|transcribe|whisper|embed|moderation|realtime|live|dall|sora|search|computer|robotics|aqa|learnlm|gemma|davinci|babbage|instruct|codex|deep-research|customtools|diffusion|chatgpt-|omni-moderation|vision-preview|imagine|video|-exp\b|exp-)/i;
const num = (id: string) => Number(id.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0);
const tier = (id: string, p: ProviderId): number => {
  if (/nano|lite|-8b/.test(id)) return 0;
  if (/(^|-)mini(-|$)|flash|fast/.test(id)) return 1;
  if (p === 'gemini') return /pro/.test(id) ? 3 : 2;
  return /pro|large|ultra|max|opus/.test(id) ? 3 : 2;
};
const brand: Record<string, string> = { openai: 'OpenAI', gemini: 'Google', xai: 'xAI' };
const nice = (id: string, p: ProviderId) => `${brand[p] ?? p} ${id.replace(/^gemini-/, 'Gemini ').replace(/^gpt-/, 'GPT-').replace(/-preview.*$/, ' (preview)').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()}`;

/** Pure: turns one provider's live model list into the chat models worth offering. Nothing is hard-coded, so a retired model drops out by itself. */
export function textModelsFrom(p: ProviderId, list: ListedLike[]): TextModel[] {
  const ids = new Set(list.map((m) => m.id));
  const ok = list.filter((m) => {
    if (NOT_CHAT.test(m.id)) return false;
    if (p === 'gemini') return /^gemini-\d/.test(m.id) && m.methods.includes('generateContent') && !/-latest$/.test(m.id);
    if (p === 'openai') return /^(gpt-\d|o\d)/.test(m.id) && !/-pro(-\d{4}.*)?$/.test(m.id) && !(/-\d{4}-\d{2}-\d{2}$/.test(m.id) && ids.has(m.id.replace(/-\d{4}-\d{2}-\d{2}$/, ''))) && !/-\d{4}$/.test(m.id);
    if (p === 'xai') return /^grok-/.test(m.id) && !/-\d{4}$/.test(m.id);
    return false;
  });
  return ok.map((m) => {
    const t = tier(m.id, p); const preview = /preview|beta/.test(m.id) ? 0.4 : 0;
    // quality: newer and bigger is better; speed: smaller is better
    return { id: m.id, provider: p, name: nice(m.id, p), quality: Math.max(1, Math.min(3, t === 3 ? 3 : t >= 2 ? 2 : 1)) as 1 | 2 | 3, speed: (t <= 1 ? 3 : t === 2 ? 2 : 1) as 1 | 2 | 3, _v: num(m.id) - preview, _t: t } as TextModel & { _v: number; _t: number };
  }).sort((a, b) => ((b as unknown as { _v: number })._v - (a as unknown as { _v: number })._v) || ((b as unknown as { _t: number })._t - (a as unknown as { _t: number })._t)).map(({ id, provider, name, speed, quality }) => ({ id, provider, name, speed, quality }));
}

/** Best first. "quality" prefers the newest, biggest model; "speed" prefers the newest small one. */
export function rankText(models: TextModel[], prefer: 'quality' | 'speed', need?: { kinds?: AttachKind[] }): TextModel[] {
  const key = (m: TextModel) => (prefer === 'speed' ? m.speed * 100 + num(m.id) : m.quality * 100 + num(m.id));
  const fits = (m: TextModel) => !need?.kinds?.length || need.kinds.every((k) => ['text', 'docx'].includes(k) || nativeKinds(m.provider).includes(k));
  const all = [...models].sort((a, b) => key(b) - key(a));
  return [...all.filter(fits), ...all.filter((m) => !fits(m))];
}

// ---------------------------------------------------------------- streaming helper
async function readEvents(r: Response, onEvent: (data: string) => void): Promise<void> {
  const feed = (line: string) => { const l = line.replace(/\r$/, ''); if (l.startsWith('data:')) { const d = l.slice(5).trim(); if (d && d !== '[DONE]') onEvent(d); } };
  if (!r.body) { for (const l of (await r.text()).split('\n')) feed(l); return; }
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i: number;
      while ((i = buf.indexOf('\n')) >= 0) { feed(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    feed(buf);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Cancelled.');
    throw perr('The connection dropped while the answer was arriving. Try again.');
  }
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const COMPAT: Record<'openai' | 'xai', { url: string; tokens: 'max_completion_tokens' | 'max_tokens' }> = {
  openai: { url: 'https://api.openai.com/v1/chat/completions', tokens: 'max_completion_tokens' },
  xai: { url: 'https://api.x.ai/v1/chat/completions', tokens: 'max_tokens' },
};
const FILE_HEAD = (n: string) => `File: ${n}`;

interface Round { text: string; truncated: boolean; }

async function geminiParts(r: TextRequest, text: string, skip: Attachment[]): Promise<unknown[]> {
  const parts: unknown[] = [];
  for (const f of r.files) {
    if (skip.includes(f)) continue;
    if (f.kind === 'text' || f.kind === 'docx') parts.push({ text: `${FILE_HEAD(f.name)}\n\`\`\`\n${await textOf(f)}\n\`\`\`` });
    else parts.push({ inlineData: { mimeType: f.mime || (f.kind === 'pdf' ? 'application/pdf' : 'application/octet-stream'), data: await base64Of(f.blob) } });
  }
  parts.push({ text });
  return parts;
}

async function geminiRound(secret: string, r: TextRequest, contents: unknown[], stream: boolean, onDelta: (t: string) => void): Promise<Round> {
  const url = `${GEMINI}/models/${r.model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  const res = await call(url, { method: 'POST', signal: r.signal, headers: { 'x-goog-api-key': secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: r.system }] }, contents, generationConfig: { temperature: 0.7, maxOutputTokens: r.maxTokens ?? 8192 } }) }, secret);
  if (!res.ok) throw await failure(res, secret);
  let out = ''; let finish = ''; let blocked = '';
  const take = (j: { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } }) => {
    if (j.promptFeedback?.blockReason) blocked = j.promptFeedback.blockReason;
    const c = j.candidates?.[0]; if (c?.finishReason) finish = c.finishReason;
    const add = (c?.content?.parts ?? []).filter((x) => !x.thought).map((x) => x.text ?? '').join('');
    if (add) { out += add; onDelta(add); }
  };
  if (stream) await readEvents(res, (d) => { try { take(JSON.parse(d)); } catch { /* partial event */ } });
  else take(await res.json());
  if (blocked && !out) throw perr('The request was blocked by the provider\'s safety filters. Try rewording it.');
  if (finish === 'SAFETY' && !out) throw perr('The answer was blocked by the provider\'s safety filters. Try rewording the request.');
  return { text: out, truncated: finish === 'MAX_TOKENS' };
}

async function compatRound(p: 'openai' | 'xai', secret: string, r: TextRequest, messages: unknown[], stream: boolean, onDelta: (t: string) => void): Promise<Round> {
  const cfg = COMPAT[p];
  const body = { model: r.model, messages, [cfg.tokens]: r.maxTokens ?? 8000, ...(stream ? { stream: true } : {}) };
  const res = await call(cfg.url, { method: 'POST', signal: r.signal, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, secret);
  if (!res.ok) {
    // Some accounts cannot stream some models. Retry once without streaming.
    if (stream && (res.status === 400 || res.status === 403)) { const t = await res.clone().text().catch(() => ''); if (/stream/i.test(t)) return compatRound(p, secret, r, messages, false, onDelta); }
    throw await failure(res, secret);
  }
  let out = ''; let finish = '';
  const take = (j: { choices?: { delta?: { content?: string | null }; message?: { content?: string | null }; finish_reason?: string | null }[] }) => {
    const c = j.choices?.[0]; if (c?.finish_reason) finish = c.finish_reason;
    const add = (stream ? c?.delta?.content : c?.message?.content) ?? '';
    if (add) { out += add; onDelta(add); }
  };
  if (stream) await readEvents(res, (d) => { try { take(JSON.parse(d)); } catch { /* partial event */ } });
  else take(await res.json());
  if (finish === 'content_filter' && !out) throw perr('The answer was blocked by the provider\'s safety filters. Try rewording the request.');
  return { text: out, truncated: finish === 'length' };
}

const CONTINUE = 'Continue exactly where you stopped. Do not repeat anything already written, do not add an introduction, and keep the same structure and format.';
const MAX_ROUNDS = 5;

/** Writes the answer. If the provider stops at its length limit, asks it to carry on (up to a few times) so long documents arrive whole. */
export async function generateText(p: ProviderId, secret: string, r: TextRequest): Promise<TextResult> {
  if (p !== 'gemini' && p !== 'openai' && p !== 'xai') throw perr('That provider cannot be used for text yet.');
  const skip = unreadable(p, r.files);
  const url = p === 'gemini' ? `${GEMINI}/` : COMPAT[p].url;
  const stream = canStream(url);
  let soFar = ''; const push = (t: string) => { soFar += t; r.onText?.(soFar); };
  let truncated = false;

  if (p === 'gemini') {
    const contents: unknown[] = [...r.history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })), { role: 'user', parts: await geminiParts(r, r.prompt, skip) }];
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const round = await geminiRound(secret, r, contents, stream, push); truncated = round.truncated;
      if (!round.truncated) break;
      contents.push({ role: 'model', parts: [{ text: round.text }] }, { role: 'user', parts: [{ text: CONTINUE }] });
    }
  } else {
    const content: unknown[] = [];
    for (const f of r.files) {
      if (skip.includes(f)) continue;
      if (f.kind === 'text' || f.kind === 'docx') content.push({ type: 'text', text: `${FILE_HEAD(f.name)}\n\`\`\`\n${await textOf(f)}\n\`\`\`` });
      else if (f.kind === 'image') content.push({ type: 'image_url', image_url: { url: `data:${f.mime};base64,${await base64Of(f.blob)}` } });
      else if (f.kind === 'pdf') content.push({ type: 'file', file: { filename: f.name, file_data: `data:application/pdf;base64,${await base64Of(f.blob)}` } });
    }
    content.push({ type: 'text', text: r.prompt });
    const messages: unknown[] = [{ role: 'system', content: r.system }, ...r.history.map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: content.length === 1 ? r.prompt : content }];
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const round = await compatRound(p, secret, r, messages, stream, push); truncated = round.truncated;
      if (!round.truncated) break;
      messages.push({ role: 'assistant', content: round.text }, { role: 'user', content: CONTINUE });
    }
  }
  if (!soFar.trim()) throw perr('The model sent back an empty answer. Try again, or try a different model.');
  return { text: soFar.trim(), truncated, unread: skip.map((f) => f.name) };
}

export type { ProviderErr };
