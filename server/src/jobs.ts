import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
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
interface Job { id: string; uid: string; status: JobStatus; text: string; error?: string; httpStatus?: number; pauseReason?: string; truncated: boolean; provider: string; model: string; created: number; updated: number; ctl: AbortController; encryptedPayload?: string; leaseOwner?: string; leaseUntil?: number; }
export interface JobInput { provider: string; model: string; secret: string; system: string; history: { role: 'user' | 'assistant'; text: string }[]; prompt: string; maxTokens?: number; }
export interface JobView { status: JobStatus | 'queued' | 'paused'; length: number; chunk: string; error?: string; httpStatus?: number; pauseReason?: string; truncated?: boolean; }

const jobs = new Map<string, Job>();
const KEEP_MS = 48 * 3_600_000; const MAX_RUN_MS = KEEP_MS; const MAX_ROUNDS = 10;
const MAX_PER_USER = 4; const MAX_TOTAL = 150;
const CONTINUE = 'Continue exactly where you stopped. Do not repeat anything already written, do not add an introduction, and keep the same structure and format.';

const db = () => getFirestore(adminApp());
function encryptionKey(): Buffer {
  const raw = process.env.BACKGROUND_JOB_ENCRYPTION_KEY ?? '';
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('BACKGROUND_JOB_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key.');
  return key;
}
function encryptPayload(input: JobInput): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(input), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${body.toString('base64')}`;
}
export function decryptPayload(value: string): JobInput {
  const [iv64, tag64, body64] = value.split('.'); if (!iv64 || !tag64 || !body64) throw new Error('Invalid encrypted job payload.');
  const dec = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv64, 'base64')); dec.setAuthTag(Buffer.from(tag64, 'base64'));
  return JSON.parse(Buffer.concat([dec.update(Buffer.from(body64, 'base64')), dec.final()]).toString('utf8')) as JobInput;
}
const save = (j: Job) => {
  void db().doc(`jobs/${j.id}`).set({ uid: j.uid, status: j.status, text: j.text.slice(0, 100_000), persistedTruncated: j.text.length > 100_000, error: j.error ?? null, httpStatus: j.httpStatus ?? null, pauseReason: j.pauseReason ?? null, truncated: j.truncated, provider: j.provider, model: j.model, updatedAt: j.updated, expiresAt: Timestamp.fromMillis(j.created + KEEP_MS), encryptedPayload: j.encryptedPayload ?? null, leaseOwner: j.leaseOwner ?? null, leaseUntil: j.leaseUntil ?? null }, { merge: true }).catch(() => { /* Firestore transient */ });
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

export async function startJob(uid: string, input: JobInput): Promise<{ id: string } | { error: string; status: number }> {
  try {
    const store = db(); const active = await store.collection('jobs').where('uid', '==', uid).get();
    const open = active.docs.filter(d => ['queued', 'running'].includes(String(d.data().status)));
    if (open.length >= MAX_PER_USER) return { error: 'You already have several background jobs queued or running. Wait for one to finish.', status: 429 };
    const globalActive = await store.collection('jobs').where('status', 'in', ['queued', 'running']).limit(MAX_TOTAL).get();
    if (globalActive.size >= MAX_TOTAL) return { error: 'The background worker queue is busy. Try again shortly.', status: 503 };
    const encryptedPayload = encryptPayload(input); const now = Date.now(); const id = randomUUID();
    await store.doc(`jobs/${id}`).create({ uid, status: 'queued', text: '', truncated: false, provider: input.provider, model: input.model, createdAt: now, updatedAt: now, expiresAt: Timestamp.fromMillis(now + KEEP_MS), encryptedPayload, leaseOwner: null, leaseUntil: null });
    input.secret = ''; return { id };
  } catch (e) { return { error: e instanceof Error && /BACKGROUND_JOB_ENCRYPTION_KEY/.test(e.message) ? e.message : 'Durable background queue is unavailable. Configure Firestore and the job encryption key, then retry.', status: 503 }; }
}

export async function jobView(uid: string, id: string, from: number): Promise<JobView | null> {
  if (!/^[a-f0-9-]{20,80}$/i.test(id)) return null;
  try { const snap = await db().doc(`jobs/${id}`).get(); const d = snap.data(); if (!d || d.uid !== uid) return null;
    const text = String(d.text ?? ''); return { status: d.status === 'running' && d.pauseReason ? 'paused' : (d.status as JobStatus | 'queued'), length: text.length, chunk: text.slice(Math.max(0, from)), error: d.error ?? undefined, httpStatus: d.httpStatus ?? undefined, pauseReason: d.pauseReason ?? undefined, truncated: !!d.truncated || !!d.persistedTruncated };
  } catch { return null; }
}

export async function cancelJob(uid: string, id: string): Promise<boolean> { try { const ref = db().doc(`jobs/${id}`); const result = await db().runTransaction(async tx => { const snap = await tx.get(ref); const d = snap.data(); if (!d || d.uid !== uid || !['queued','running'].includes(String(d.status))) return false; tx.update(ref, { status: 'cancelled', updatedAt: Date.now(), encryptedPayload: null, leaseUntil: null }); return true; }); const j = jobs.get(id); if (j) { j.status = 'cancelled'; j.ctl.abort(); } return result; } catch { return false; } }

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

export async function run(job: Job, input: JobInput) {
  const once = makeOnce(job, input);
  const messages: { role: 'user' | 'assistant'; content: string }[] = [...input.history.map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: input.prompt }];
  if (job.text.trim()) messages.push({ role: 'assistant', content: job.text }, { role: 'user', content: CONTINUE });
  const push = (t: string) => { job.text += t; job.updated = Date.now(); };
  const persistTimer = setInterval(() => save(job), 2_000); persistTimer.unref();
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
  } finally { clearInterval(persistTimer); job.updated = Date.now(); job.encryptedPayload = undefined; save(job); }
}

/** Atomically claims a queued job for the dedicated worker process. */
export async function claimNextJob(workerId: string): Promise<{ job: Job; input: JobInput } | null> {
  const dbx = db(); const now = Date.now(); const queued = await dbx.collection('jobs').where('status', '==', 'queued').limit(1).get(); const running = await dbx.collection('jobs').where('status', '==', 'running').limit(30).get(); const expiredDocs = running.docs.filter(doc => Number(doc.data().leaseUntil ?? 0) <= now).slice(0, 1); const expired = { docs: expiredDocs };  const candidates = [...queued.docs, ...expired.docs];
  for (const candidate of candidates) {
    const claimed = await dbx.runTransaction(async tx => { const snap = await tx.get(candidate.ref); const d = snap.data(); if (!d || !(d.status === 'queued' || (d.status === 'running' && Number(d.leaseUntil ?? 0) <= now))) return null; tx.update(candidate.ref, { status: 'running', leaseOwner: workerId, leaseUntil: now + 90_000, updatedAt: now }); return d; });
    if (!claimed?.encryptedPayload) continue;
    try { const input = decryptPayload(String(claimed.encryptedPayload)); const job: Job = { id: candidate.id, uid: String(claimed.uid), status: 'running', text: String(claimed.text ?? ''), truncated: !!claimed.truncated, provider: String(claimed.provider), model: String(claimed.model), created: Number(claimed.createdAt ?? now), updated: now, ctl: new AbortController(), encryptedPayload: String(claimed.encryptedPayload), leaseOwner: workerId, leaseUntil: now + 90_000 }; jobs.set(job.id, job); return { job, input }; }
    catch { await candidate.ref.update({ status: 'error', error: 'Could not decrypt queued task. Check BACKGROUND_JOB_ENCRYPTION_KEY.', encryptedPayload: null, updatedAt: now }); }
  }
  return null;
}
