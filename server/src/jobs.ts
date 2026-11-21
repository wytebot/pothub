import { randomUUID } from 'node:crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { adminApp } from './adminApp';

/**
 * Background jobs. The app hands over one text-generation request; the server runs it to the end even if the person
 * closes the app, then keeps the result for 48 hours so the app can pick it up whenever it is opened again.
 *
 * The provider key is used only for this one run: it lives in memory while the job runs, is never written to disk or
 * Firestore, never logged, and is dropped the moment the job ends.
 */
type Api = 'openai' | 'gemini' | 'anthropic';
const ENDPOINTS: Record<string, { api: Api; chat: string; tokens?: string }> = {
  openai: { api: 'openai', chat: 'https://api.openai.com/v1/chat/completions', tokens: 'max_completion_tokens' },
  gemini: { api: 'gemini', chat: 'https://generativelanguage.googleapis.com/v1beta' },
  xai: { api: 'openai', chat: 'https://api.x.ai/v1/chat/completions', tokens: 'max_tokens' },
  anthropic: { api: 'anthropic', chat: 'https://api.anthropic.com/v1/messages' },
  deepseek: { api: 'openai', chat: 'https://api.deepseek.com/chat/completions', tokens: 'max_tokens' },
  mistral: { api: 'openai', chat: 'https://api.mistral.ai/v1/chat/completions', tokens: 'max_tokens' },
  groq: { api: 'openai', chat: 'https://api.groq.com/openai/v1/chat/completions', tokens: 'max_completion_tokens' },
  openrouter: { api: 'openai', chat: 'https://openrouter.ai/api/v1/chat/completions', tokens: 'max_tokens' },
  together: { api: 'openai', chat: 'https://api.together.xyz/v1/chat/completions', tokens: 'max_tokens' },
};

export type JobStatus = 'running' | 'done' | 'error' | 'cancelled';
interface Job { id: string; uid: string; status: JobStatus; text: string; error?: string; httpStatus?: number; pauseReason?: string; truncated: boolean; provider: string; model: string; created: number; updated: number; ctl: AbortController; }
export interface JobInput { provider: string; model: string; secret: string; system: string; history: { role: 'user' | 'assistant'; text: string }[]; prompt: string; maxTokens?: number; }
export interface JobView { status: JobStatus | 'paused'; length: number; chunk: string; error?: string; httpStatus?: number; pauseReason?: string; truncated?: boolean; }

const jobs = new Map<string, Job>();
const KEEP_MS = 48 * 3_600_000; const MAX_RUN_MS = KEEP_MS; const MAX_ROUNDS = 10;
const MAX_PER_USER = 4; const MAX_TOTAL = 150;
const CONTINUE = 'Continue exactly where you stopped. Do not repeat anything already written, do not add an introduction, and keep the same structure and format.';

const db = () => getFirestore(adminApp());
const save = (j: Job) => {
  // Result only (never the key). Best effort: the in-memory copy is the source of truth while the server is up.
  void db().doc(`jobs/${j.id}`).set({ uid: j.uid, status: j.status, text: j.text.slice(0, 100_000), persistedTruncated: j.text.length > 100_000, error: j.error ?? null, httpStatus: j.httpStatus ?? null, pauseReason: j.pauseReason ?? null, truncated: j.truncated, provider: j.provider, model: j.model, updatedAt: j.updated, expiresAt: Timestamp.fromMillis(j.created + KEEP_MS) }).catch(() => { /* Firestore not configured */ });
};
setInterval(() => { const now = Date.now(); for (const [id, j] of jobs) if (j.status !== 'running' && now - j.updated > KEEP_MS) jobs.delete(id); }, 10 * 60_000).unref();

export function validate(b: unknown): JobInput | string {
  const x = b as Partial<JobInput>;
  if (!x || typeof x !== 'object') return 'Invalid request.';
  if (typeof x.provider !== 'string' || !(x.provider in ENDPOINTS)) return 'That provider is not supported.';
  if (typeof x.model !== 'string' || !/^[\w.:/@+-]{1,160}$/.test(x.model)) return 'Invalid model.';
  if (typeof x.secret !== 'string' || x.secret.length < 8 || x.secret.length > 600) return 'Invalid key.';
  if (typeof x.prompt !== 'string' || !x.prompt.trim()) return 'Nothing to answer.';
  const history = Array.isArray(x.history) ? x.history.filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string') : [];
  const size = x.prompt.length + (x.system?.length ?? 0) + history.reduce((n, h) => n + h.text.length, 0);
  if (size > 6_000_000) return 'This request is too large to run in the background.';
  return { provider: x.provider, model: x.model, secret: x.secret, system: typeof x.system === 'string' ? x.system : '', history, prompt: x.prompt, maxTokens: typeof x.maxTokens === 'number' && x.maxTokens > 0 ? Math.min(x.maxTokens, 128_000) : undefined };
}

export function startJob(uid: string, input: JobInput): { id: string } | { error: string; status: number } {
  const mine = [...jobs.values()].filter((j) => j.uid === uid && j.status === 'running').length;
  if (mine >= MAX_PER_USER) return { error: 'You already have several jobs running. Wait for one to finish.', status: 429 };
  if ([...jobs.values()].filter((j) => j.status === 'running').length >= MAX_TOTAL) return { error: 'The server is busy. Try again in a minute.', status: 503 };
  const now = Date.now(); const job: Job = { id: randomUUID(), uid, status: 'running', text: '', truncated: false, provider: input.provider, model: input.model, created: now, updated: now, ctl: new AbortController() };
  jobs.set(job.id, job); save(job);
  const limit = setTimeout(() => job.ctl.abort(), MAX_RUN_MS); limit.unref();
  void run(job, input).finally(() => { clearTimeout(limit); input.secret = ''; });
  return { id: job.id };
}

export async function jobView(uid: string, id: string, from: number): Promise<JobView | null> {
  let j = jobs.get(id);
  if (j) { if (j.uid !== uid) return null; return { status: j.status === 'running' && j.pauseReason ? 'paused' : j.status, length: j.text.length, chunk: j.text.slice(Math.max(0, from)), error: j.error, httpStatus: j.httpStatus, pauseReason: j.pauseReason, truncated: j.truncated }; }
  try {
    const d = (await db().doc(`jobs/${id}`).get()).data(); if (!d || d.uid !== uid) return null;
    // A job that was still running when the server restarted cannot continue: its key was only ever held in memory.
    const interrupted = d.status === 'running';
    const text = String(d.text ?? '');
    return { status: interrupted ? 'error' : d.status, length: text.length, chunk: text.slice(Math.max(0, from)), error: interrupted ? 'The server restarted while this was running. Send it again.' : (d.error ?? undefined), httpStatus: d.httpStatus ?? undefined, truncated: !!d.truncated || !!d.persistedTruncated };
  } catch { return null; }
}
export function cancelJob(uid: string, id: string): boolean { const j = jobs.get(id); if (!j || j.uid !== uid) return false; if (j.status === 'running') { j.status = 'cancelled'; j.updated = Date.now(); j.ctl.abort(); save(j); } return true; }

// ------------------------------------------------------------------------------------------------ provider calls
const scrub = (t: string, secret: string) => (secret ? t.split(secret).join('••••') : t);
class ProviderError extends Error { constructor(m: string, public status?: number) { super(m); } }
function statusMessage(status: number, detail: string): string {
  if (status === 401 || status === 403) return 'The provider rejected this key. Check that it is correct, active and allowed to use this model.';
  if (status === 402) return 'Your provider account has no credit left. Add credit with the provider, then try again.';
  if (status === 429) return 'Rate limit or quota reached on your provider account. Wait a moment or check your plan and billing.';
  if (status >= 500) return 'The provider is having problems right now. Try again shortly.';
  return detail || `The provider returned an error (${status}).`;
}
async function failed(r: Response, secret: string): Promise<ProviderError> {
  let detail = ''; try { const j = await r.json() as Record<string, any>; const e = j.error; detail = scrub(String((typeof e === 'string' ? e : e?.message) ?? j.message ?? ''), secret).slice(0, 220); } catch { /* not JSON */ }
  return new ProviderError(statusMessage(r.status, detail), r.status);
}
async function events(r: Response, onData: (d: string) => void) {
  if (!r.body) return;
  const dec = new TextDecoder(); let buf = '';
  const feed = (line: string) => { const l = line.replace(/\r$/, ''); if (l.startsWith('data:')) { const d = l.slice(5).trim(); if (d && d !== '[DONE]') onData(d); } };
  for await (const part of r.body as unknown as AsyncIterable<Uint8Array>) { buf += dec.decode(part, { stream: true }); let i: number; while ((i = buf.indexOf('\n')) >= 0) { feed(buf.slice(0, i)); buf = buf.slice(i + 1); } }
  feed(buf);
}
interface Round { text: string; truncated: boolean; }
type Once = (messages: { role: 'user' | 'assistant'; content: string }[], push: (t: string) => void) => Promise<Round>;

function makeOnce(job: Job, i: JobInput): Once {
  const ep = ENDPOINTS[i.provider]; const sig = job.ctl.signal; const secret = i.secret;
  const post = (url: string, headers: Record<string, string>, body: unknown) => fetch(url, { method: 'POST', signal: sig, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (ep.api === 'gemini') return async (messages, push) => {
    const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const res = await post(`${ep.chat}/models/${i.model}:streamGenerateContent?alt=sse`, { 'x-goog-api-key': secret }, { systemInstruction: { parts: [{ text: i.system }] }, contents, generationConfig: { temperature: 0.7, ...(i.maxTokens ? { maxOutputTokens: i.maxTokens } : {}) } });
    if (!res.ok) throw await failed(res, secret);
    let out = ''; let finish = '';
    await events(res, (d) => { try { const j = JSON.parse(d); const c = j.candidates?.[0]; if (c?.finishReason) finish = c.finishReason; const add = (c?.content?.parts ?? []).filter((x: any) => !x.thought).map((x: any) => x.text ?? '').join(''); if (add) { out += add; push(add); } } catch { /* partial */ } });
    if (!out && finish === 'SAFETY') throw new ProviderError('The answer was blocked by the provider\'s safety filters. Try rewording the request.');
    return { text: out, truncated: finish === 'MAX_TOKENS' };
  };
  if (ep.api === 'anthropic') return async (messages, push) => {
    const res = await post(ep.chat, { 'x-api-key': secret, 'anthropic-version': '2023-06-01' }, { model: i.model, max_tokens: i.maxTokens ?? 8192, system: i.system, messages, stream: true });
    if (!res.ok) throw await failed(res, secret);
    let out = ''; let stop = '';
    await events(res, (d) => { try { const j = JSON.parse(d); if (j.type === 'content_block_delta' && j.delta?.text) { out += j.delta.text; push(j.delta.text); } else if (j.type === 'message_delta' && j.delta?.stop_reason) stop = j.delta.stop_reason; } catch { /* partial */ } });
    return { text: out, truncated: stop === 'max_tokens' };
  };
  return async (messages, push) => {
    const body = { model: i.model, messages: [{ role: 'system', content: i.system }, ...messages], stream: true, ...(i.maxTokens ? { [ep.tokens ?? 'max_tokens']: i.maxTokens } : {}) };
    const res = await post(ep.chat, { Authorization: `Bearer ${secret}` }, body);
    if (!res.ok) throw await failed(res, secret);
    let out = ''; let finish = '';
    await events(res, (d) => { try { const j = JSON.parse(d); const c = j.choices?.[0]; if (c?.finish_reason) finish = c.finish_reason; const add = c?.delta?.content ?? ''; if (add) { out += add; push(add); } } catch { /* partial */ } });
    if (!out && finish === 'content_filter') throw new ProviderError('The answer was blocked by the provider\'s safety filters. Try rewording the request.');
    return { text: out, truncated: finish === 'length' };
  };
}

async function run(job: Job, input: JobInput) {
  const once = makeOnce(job, input);
  const messages: { role: 'user' | 'assistant'; content: string }[] = [...input.history.map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: input.prompt }];
  const push = (t: string) => { job.text += t; job.updated = Date.now(); };
  try {
    let drops = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let got = '';
      try {
        const r = await once(messages, (t) => { got += t; push(t); });
        if (!r.truncated) { job.truncated = false; break; }
        got = r.text; job.truncated = round === MAX_ROUNDS - 1;
      } catch (e) {
        if (job.status !== 'running') return;
        if (job.ctl.signal.aborted) throw e;
        // Provider rate limits, exhausted credits, and transient outages pause rather than
        // terminate the job. Retry with bounded exponential backoff until the job deadline.
        const status = e instanceof ProviderError ? e.status : undefined;
        const retryable = status === 402 || status === 429 || (typeof status === 'number' && status >= 500) || !(e instanceof ProviderError);
        if (!retryable) throw e;
        drops++;
        const delay = status === 402 ? 5 * 60_000 : status === 429 ? Math.min(5 * 60_000, 30_000 * Math.pow(2, Math.min(drops - 1, 4))) : Math.min(60_000, 5_000 * drops);
        job.pauseReason = status === 402 ? 'Provider credits exhausted. This job is paused and will retry periodically after credits are restored.' : status === 429 ? 'Provider rate limit reached. This job is paused and will retry automatically.' : 'Connection/provider unavailable. This job is paused and will retry when service recovers.';
        job.updated = Date.now(); save(job);
        await new Promise((r) => setTimeout(r, delay));
        if (job.status !== 'running' || job.ctl.signal.aborted) return;
        job.pauseReason = undefined; job.updated = Date.now(); save(job);
        if (!got) { round--; continue; }
      }
      if (!got.trim()) throw new ProviderError('The provider stopped before completing the answer and returned no continuation text.');
      messages.push({ role: 'assistant', content: got }, { role: 'user', content: CONTINUE });
    }
    if (job.status === 'running') { if (!job.text.trim()) throw new ProviderError('The model sent back an empty answer. Try again, or try a different model.'); job.text = job.text.trim(); job.status = 'done'; }
  } catch (e) {
    if (job.status === 'cancelled') return;
    job.status = 'error'; job.httpStatus = e instanceof ProviderError ? e.status : undefined;
    job.error = job.ctl.signal.aborted ? 'This job exceeded the 48 hour processing window and was stopped. Its saved partial answer is still available for recovery.' : scrub(e instanceof ProviderError ? e.message : 'Could not reach the provider. Try again.', input.secret);
  } finally { job.updated = Date.now(); save(job); }
}
