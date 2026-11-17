import type { ProviderId } from '../vault/vault';
import type { ImageModel, VideoModel } from './registry';
import { blobFromB64, call, dims, failure, imageFromBlob, perr, sleep, type ProviderErr } from './http';

export interface GenImg { blob: Blob; mime: string; }
export interface ImgInput { model: ImageModel; prompt: string; aspect: string; count: number; signal?: AbortSignal; }
export type PollResult = { state: 'running'; note?: string } | { state: 'done'; uri: string } | { state: 'failed'; message: string };

const J = { 'Content-Type': 'application/json' };
const bearer = (s: string) => ({ Authorization: `Bearer ${s}` });
const bad = (m: string) => perr(m);
const blocked = () => bad('The prompt was blocked by the provider\'s safety filters. Try rewording it.');

async function json<T>(r: Response, secret: string): Promise<T> { if (!r.ok) throw await failure(r, secret); return await r.json() as T; }
async function fetchImage(url: string, secret: string, headers?: Record<string, string>): Promise<GenImg> {
  const r = await call(url, { headers }, secret);
  if (!r.ok) throw await failure(r, secret);
  return imageFromBlob(await r.blob());
}
const fromUrls = async (urls: (string | undefined)[], secret: string) => {
  const out: GenImg[] = []; for (const u of urls) if (u) out.push(await fetchImage(u, secret));
  if (!out.length) throw bad('The provider returned no image.');
  return out;
};
const fromB64s = (list: (string | undefined)[]) => {
  const out = list.filter((x): x is string => !!x).map((b) => { const blob = blobFromB64(b); return { blob, mime: blob.type }; });
  if (!out.length) throw bad('The provider returned no image.');
  return out;
};
const dashed = (a: string) => a.replace(':', 'x');

/** Polls `step` until it returns a value. Gives up after `ms`. */
async function until<T>(step: () => Promise<T | null>, ms: number, every: number, signal?: AbortSignal): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await step(); if (v !== null) return v;
    if (Date.now() - t0 > ms) throw bad('The provider took too long to finish. Try again.');
    await sleep(every, signal);
  }
}

// ---------------------------------------------------------------- key tests
export type KeyTest = 'ok' | 'invalid' | 'error';
export interface Probe { status: KeyTest; message?: string; }
async function probe(url: string, init: RequestInit, secret: string, o: { okStatuses?: number[] } = {}): Promise<Probe> {
  const r = await call(url, init, secret);
  if (r.ok || o.okStatuses?.includes(r.status)) return { status: 'ok' };
  if (r.status === 401 || r.status === 403) return { status: 'invalid' };
  return { status: 'error', message: (await failure(r, secret)).message };
}

// ---------------------------------------------------------------- Kling (signed token from two keys)
const b64u = (b: ArrayBuffer | string) => { const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b); let s = ''; bytes.forEach((c) => { s += String.fromCharCode(c); }); return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); };
async function klingToken(secret: string): Promise<string> {
  const [ak, sk] = secret.split(':');
  if (!ak || !sk) throw bad('Kling needs both keys, written as AccessKey:SecretKey.');
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(sk), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${head}.${b64u(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(head)))}`;
}
const KLING = 'https://api.klingai.com';
const klingHeaders = async (s: string) => ({ ...J, Authorization: `Bearer ${await klingToken(s)}` });
async function klingJson<T extends { code?: number; message?: string }>(r: Response, secret: string): Promise<T> {
  const j = await json<T>(r, secret);
  if (j.code && j.code !== 0) throw (j.code >= 1000 && j.code <= 1004 ? perr('The provider rejected this key. Check that it is correct, active and allowed to use this model.', 401) : bad(j.message || 'Kling could not process this request.'));
  return j;
}

export async function testProviderKey(p: ProviderId, secret: string): Promise<Probe> {
  switch (p) {
    case 'xai': return probe('https://api.x.ai/v1/models', { headers: bearer(secret) }, secret);
    case 'stability': return probe('https://api.stability.ai/v1/user/balance', { headers: bearer(secret) }, secret);
    case 'bfl': return probe('https://api.bfl.ai/v1/credits', { headers: { 'x-key': secret } }, secret);
    case 'ideogram': return probe('https://api.ideogram.ai/v1/ideogram-v3/generate', { method: 'POST', headers: { 'Api-Key': secret } }, secret, { okStatuses: [400, 415, 422] });
    case 'recraft': return probe('https://external.api.recraft.ai/v1/users/me', { headers: bearer(secret) }, secret);
    case 'together': return probe('https://api.together.xyz/v1/models', { headers: bearer(secret) }, secret);
    case 'leonardo': return probe('https://cloud.leonardo.ai/api/rest/v1/me', { headers: bearer(secret) }, secret);
    case 'luma': return probe('https://api.lumalabs.ai/dream-machine/v1/generations?limit=1', { headers: bearer(secret) }, secret);
    case 'minimax': {
      const r = await call('https://api.minimax.io/v1/image_generation', { method: 'POST', headers: { ...J, ...bearer(secret) }, body: JSON.stringify({}) }, secret);
      if (r.status === 401 || r.status === 403) return { status: 'invalid' };
      const j = await r.json().catch(() => ({})) as { base_resp?: { status_code?: number } };
      const c = j.base_resp?.status_code;
      return c === 1004 || c === 2049 ? { status: 'invalid' } : { status: 'ok' };
    }
    case 'zhipu': return probe('https://open.bigmodel.cn/api/paas/v4/images/generations', { method: 'POST', headers: { ...J, ...bearer(secret) }, body: JSON.stringify({}) }, secret, { okStatuses: [400, 422] });
    case 'byteplus': return probe('https://ark.ap-southeast.bytepluses.com/api/v3/models', { headers: bearer(secret) }, secret);
    case 'huggingface': return probe('https://huggingface.co/api/whoami-v2', { headers: bearer(secret) }, secret);
    case 'fal': return probe('https://queue.fal.run/fal-ai/flux/dev/requests/00000000-0000-0000-0000-000000000000/status', { headers: { Authorization: `Key ${secret}` } }, secret, { okStatuses: [400, 404, 405, 422] });
    case 'replicate': return probe('https://api.replicate.com/v1/account', { headers: bearer(secret) }, secret);
    case 'kling': {
      const r = await call(`${KLING}/v1/videos/text2video/00000000`, { headers: await klingHeaders(secret) }, secret);
      const j = await r.json().catch(() => ({})) as { code?: number };
      return r.status === 401 || (j.code !== undefined && j.code >= 1000 && j.code <= 1004) ? { status: 'invalid' } : { status: 'ok' };
    }
    default: return { status: 'error', message: 'This provider cannot be tested here.' };
  }
}

// ---------------------------------------------------------------- images
const FLUX_SIZE = (a: string) => dims(a, 1024, 32);

export async function generateWithAdapter(p: ProviderId, secret: string, i: ImgInput): Promise<GenImg[]> {
  const { model: m, prompt, aspect, count, signal } = i;
  const n = Math.min(count, m.maxBatch);
  switch (p) {
    case 'xai': {
      const j = await json<{ data?: { b64_json?: string }[] }>(await call('https://api.x.ai/v1/images/generations', { method: 'POST', signal, headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ model: m.id, prompt, n, response_format: 'b64_json' }) }, secret), secret);
      return fromB64s((j.data ?? []).map((d) => d.b64_json));
    }
    case 'stability': {
      const f = new FormData(); f.append('prompt', prompt); f.append('aspect_ratio', aspect); f.append('output_format', 'png');
      if (m.params?.model) f.append('model', String(m.params.model));
      const j = await json<{ image?: string; finish_reason?: string }>(await call(`https://api.stability.ai/v2beta/stable-image/generate/${m.params?.path ?? 'core'}`, { method: 'POST', signal, headers: { ...bearer(secret), Accept: 'application/json' }, body: f }, secret), secret);
      if (j.finish_reason === 'CONTENT_FILTERED') throw blocked();
      return fromB64s([j.image]);
    }
    case 'bfl': {
      const body: Record<string, unknown> = { prompt, output_format: 'png', safety_tolerance: 2 };
      if (m.params?.ar) body.aspect_ratio = aspect; else { const d = FLUX_SIZE(aspect); body.width = d.w; body.height = d.h; }
      const H = { ...J, 'x-key': secret };
      const out: GenImg[] = [];
      for (let k = 0; k < n; k++) {
        const start = await json<{ id: string; polling_url?: string }>(await call(`https://api.bfl.ai/v1/${m.id}`, { method: 'POST', signal, headers: H, body: JSON.stringify(body) }, secret), secret);
        const url = start.polling_url ?? `https://api.bfl.ai/v1/get_result?id=${encodeURIComponent(start.id)}`;
        const sample = await until(async () => {
          const j = await json<{ status: string; result?: { sample?: string } }>(await call(url, { signal, headers: { 'x-key': secret } }, secret), secret);
          if (j.status === 'Ready' && j.result?.sample) return j.result.sample;
          if (/Moderated/i.test(j.status)) throw blocked();
          if (j.status === 'Error' || j.status === 'Task not found') throw bad('The provider could not create this image. Try different wording.');
          return null;
        }, 150_000, 1500, signal);
        out.push(await fetchImage(sample, secret));
      }
      return out;
    }
    case 'ideogram': {
      const f = new FormData(); f.append('prompt', prompt); f.append('aspect_ratio', dashed(aspect)); f.append('num_images', String(n)); f.append('rendering_speed', String(m.params?.speed ?? 'DEFAULT'));
      const j = await json<{ data?: { url?: string; is_image_safe?: boolean }[] }>(await call('https://api.ideogram.ai/v1/ideogram-v3/generate', { method: 'POST', signal, headers: { 'Api-Key': secret }, body: f }, secret), secret);
      const urls = (j.data ?? []).filter((d) => d.is_image_safe !== false).map((d) => d.url);
      if (!urls.length) throw blocked();
      return fromUrls(urls, secret);
    }
    case 'recraft': {
      const size = ({ '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536', '4:3': '1365x1024', '3:4': '1024x1365', '16:9': '1820x1024', '9:16': '1024x1820' } as Record<string, string>)[aspect] ?? '1024x1024';
      const j = await json<{ data?: { b64_json?: string; url?: string }[] }>(await call('https://external.api.recraft.ai/v1/images/generations', { method: 'POST', signal, headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ prompt, model: m.id, size, n, response_format: 'b64_json' }) }, secret), secret);
      const d = j.data ?? [];
      return d.some((x) => x.b64_json) ? fromB64s(d.map((x) => x.b64_json)) : fromUrls(d.map((x) => x.url), secret);
    }
    case 'together': {
      const d = FLUX_SIZE(aspect);
      const j = await json<{ data?: { b64_json?: string; url?: string }[] }>(await call('https://api.together.xyz/v1/images/generations', { method: 'POST', signal, headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ model: m.id, prompt, width: d.w, height: d.h, n, ...(m.params?.steps ? { steps: m.params.steps } : {}), response_format: 'b64_json' }) }, secret), secret);
      const x = j.data ?? [];
      return x.some((v) => v.b64_json) ? fromB64s(x.map((v) => v.b64_json)) : fromUrls(x.map((v) => v.url), secret);
    }
    case 'leonardo': {
      const d = dims(aspect, 1024, 8);
      const start = await json<{ sdGenerationJob?: { generationId?: string } }>(await call('https://cloud.leonardo.ai/api/rest/v1/generations', { method: 'POST', signal, headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ prompt, modelId: m.id, width: d.w, height: d.h, num_images: n }) }, secret), secret);
      const id = start.sdGenerationJob?.generationId; if (!id) throw bad('The provider did not return a job id.');
      const urls = await until(async () => {
        const j = await json<{ generations_by_pk?: { status?: string; generated_images?: { url?: string }[] } }>(await call(`https://cloud.leonardo.ai/api/rest/v1/generations/${id}`, { signal, headers: bearer(secret) }, secret), secret);
        const g = j.generations_by_pk;
        if (g?.status === 'FAILED') throw bad('The provider could not create this image. Try different wording.');
        return g?.status === 'COMPLETE' ? (g.generated_images ?? []).map((x) => x.url) : null;
      }, 150_000, 2000, signal);
      return fromUrls(urls, secret);
    }
    case 'luma': {
      const start = await json<{ id?: string }>(await call('https://api.lumalabs.ai/dream-machine/v1/generations/image', { method: 'POST', signal, headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ prompt, model: m.id, aspect_ratio: aspect }) }, secret), secret);
      if (!start.id) throw bad('The provider did not return a job id.');
      const url = await until(async () => {
        const j = await json<{ state?: string; failure_reason?: string; assets?: { image?: string } }>(await call(`https://api.lumalabs.ai/dream-machine/v1/generations/${start.id}`, { signal, headers: bearer(secret) }, secret), secret);
        if (j.state === 'failed') throw bad(j.failure_reason ? 'The provider could not create this image. Try different wording.' : 'The provider could not create this image.');
        return j.state === 'completed' && j.assets?.image ? j.assets.image : null;
      }, 150_000, 2000, signal);
      return fromUrls([url], secret);
    }
    case 'minimax': {
      const j = await json<{ data?: { image_base64?: string[] }; base_resp?: { status_code?: number; status_msg?: string } }>(await call('https://api.minimax.io/v1/image_generation', { method: 'POST', signal, headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ model: m.id, prompt, aspect_ratio: aspect, response_format: 'base64', n }) }, secret), secret);
      const c = j.base_resp?.status_code ?? 0;
      if (c === 1004 || c === 2049) throw perr('The provider rejected this key. Check that it is correct, active and allowed to use this model.', 401);
      if (c === 1008) throw perr('Your provider account has no credit left. Add credit with the provider, then try again.', 402);
      if (c === 1026 || c === 1027) throw blocked();
      if (c !== 0) throw bad('The provider could not create this image.');
      return fromB64s(j.data?.image_base64 ?? []);
    }
    case 'zhipu': {
      const size = ({ '1:1': '1024x1024', '9:16': '768x1344', '16:9': '1344x768', '3:4': '864x1152', '4:3': '1152x864', '2:1': '1440x720', '1:2': '720x1440' } as Record<string, string>)[aspect] ?? '1024x1024';
      const out: GenImg[] = [];
      for (let k = 0; k < n; k++) {
        const j = await json<{ data?: { url?: string }[] }>(await call('https://open.bigmodel.cn/api/paas/v4/images/generations', { method: 'POST', signal, headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ model: m.id, prompt, size }) }, secret), secret);
        out.push(...await fromUrls((j.data ?? []).map((d) => d.url), secret));
      }
      return out;
    }
    case 'byteplus': {
      const size = ({ '1:1': '2048x2048', '16:9': '2560x1440', '9:16': '1440x2560', '4:3': '2304x1728', '3:4': '1728x2304', '3:2': '2496x1664', '2:3': '1664x2496', '21:9': '3024x1296' } as Record<string, string>)[aspect] ?? '2048x2048';
      const j = await json<{ data?: { b64_json?: string; url?: string }[] }>(await call('https://ark.ap-southeast.bytepluses.com/api/v3/images/generations', { method: 'POST', signal, headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ model: m.id, prompt, size, response_format: 'b64_json', watermark: false, ...(n > 1 ? { sequential_image_generation: 'auto', sequential_image_generation_options: { max_images: n } } : {}) }) }, secret), secret);
      const d = j.data ?? [];
      return d.some((x) => x.b64_json) ? fromB64s(d.map((x) => x.b64_json)) : fromUrls(d.map((x) => x.url), secret);
    }
    case 'kling': {
      const start = await klingJson<{ code?: number; message?: string; data?: { task_id?: string } }>(await call(`${KLING}/v1/images/generations`, { method: 'POST', signal, headers: await klingHeaders(secret), body: JSON.stringify({ model_name: m.id, prompt, aspect_ratio: aspect, n }) }, secret), secret);
      const id = start.data?.task_id; if (!id) throw bad('The provider did not return a job id.');
      const urls = await until(async () => {
        const j = await klingJson<{ code?: number; message?: string; data?: { task_status?: string; task_result?: { images?: { url?: string }[] } } }>(await call(`${KLING}/v1/images/generations/${id}`, { signal, headers: await klingHeaders(secret) }, secret), secret);
        if (j.data?.task_status === 'failed') throw bad('The provider could not create this image. Try different wording.');
        return j.data?.task_status === 'succeed' ? (j.data.task_result?.images ?? []).map((x) => x.url) : null;
      }, 150_000, 2000, signal);
      return fromUrls(urls, secret);
    }
    case 'huggingface': {
      const d = dims(aspect, 1024, 64); const id = m.id.replace(/^hf\//, '');
      const out: GenImg[] = [];
      for (let k = 0; k < n; k++) {
        const r = await call(`https://router.huggingface.co/hf-inference/models/${id}`, { method: 'POST', signal, headers: { ...J, ...bearer(secret), Accept: 'image/png' }, body: JSON.stringify({ inputs: prompt, parameters: { width: d.w, height: d.h } }) }, secret);
        if (!r.ok) throw await failure(r, secret);
        out.push(await imageFromBlob(await r.blob()));
      }
      return out;
    }
    case 'fal': {
      const d = dims(aspect, 1024, 32);
      const body: Record<string, unknown> = { prompt, num_images: n };
      if (m.params?.size === 'aspect_ratio') { body.aspect_ratio = aspect; if (n === 1) delete body.num_images; } else body.image_size = { width: d.w, height: d.h };
      const urls = await falRun<{ images?: { url?: string }[] }>(m.id, body, secret, signal).then((r) => (r.images ?? []).map((x) => x.url));
      return fromUrls(urls, secret);
    }
    case 'replicate': {
      const out = await replicateRun(m.id, { prompt, aspect_ratio: aspect, ...(n > 1 && /schnell/.test(m.id) ? { num_outputs: n } : {}), output_format: 'png' }, secret, signal);
      return fromUrls(out, secret);
    }
    default: throw bad('This provider cannot make images.');
  }
}

// ---------------------------------------------------------------- fal queue
const FAL_H = (s: string) => ({ ...J, Authorization: `Key ${s}` });
async function falSubmit(model: string, input: unknown, secret: string, signal?: AbortSignal): Promise<{ status_url: string; response_url: string }> {
  const j = await json<{ status_url?: string; response_url?: string; request_id?: string }>(await call(`https://queue.fal.run/${model}`, { method: 'POST', signal, headers: FAL_H(secret), body: JSON.stringify(input) }, secret), secret);
  if (j.status_url && j.response_url) return { status_url: j.status_url, response_url: j.response_url };
  if (!j.request_id) throw bad('The provider did not return a job id.');
  const root = model.split('/').slice(0, 2).join('/');
  return { status_url: `https://queue.fal.run/${root}/requests/${j.request_id}/status`, response_url: `https://queue.fal.run/${root}/requests/${j.request_id}` };
}
async function falPoll<T>(st: { status_url: string; response_url: string }, secret: string, signal?: AbortSignal): Promise<{ done: false } | { done: true; result: T }> {
  const s = await json<{ status?: string }>(await call(st.status_url, { signal, headers: FAL_H(secret) }, secret), secret);
  if (s.status !== 'COMPLETED') return { done: false };
  const r = await call(st.response_url, { signal, headers: FAL_H(secret) }, secret);
  if (!r.ok) { const j = await r.clone().json().catch(() => ({})) as { detail?: unknown }; if (r.status === 422 || /safety|nsfw|content/i.test(JSON.stringify(j.detail ?? ''))) throw blocked(); throw await failure(r, secret); }
  return { done: true, result: await r.json() as T };
}
async function falRun<T>(model: string, input: unknown, secret: string, signal?: AbortSignal): Promise<T> {
  const st = await falSubmit(model, input, secret, signal);
  return until(async () => { const p = await falPoll<T>(st, secret, signal); return p.done ? p.result : null; }, 240_000, 1500, signal);
}

// ---------------------------------------------------------------- Replicate
type RepPrediction = { id?: string; status?: string; output?: unknown; error?: string | null; urls?: { get?: string } };
const outUrls = (o: unknown): string[] => (Array.isArray(o) ? o.filter((x): x is string => typeof x === 'string') : typeof o === 'string' ? [o] : []);
async function replicateStart(model: string, input: unknown, secret: string, signal?: AbortSignal): Promise<RepPrediction> {
  return json<RepPrediction>(await call(`https://api.replicate.com/v1/models/${model}/predictions`, { method: 'POST', signal, headers: { ...J, ...bearer(secret), Prefer: 'wait=45' }, body: JSON.stringify({ input }) }, secret), secret);
}
const repState = (j: RepPrediction): 'done' | 'failed' | 'running' => j.status === 'succeeded' ? 'done' : j.status === 'failed' || j.status === 'canceled' ? 'failed' : 'running';
const repFail = (j: RepPrediction) => (/nsfw|safety|sensitive|flagged/i.test(j.error ?? '') ? blocked() : bad('The provider could not create this result. Try different wording.'));
async function replicateRun(model: string, input: unknown, secret: string, signal?: AbortSignal): Promise<string[]> {
  let j = await replicateStart(model, input, secret, signal);
  if (repState(j) === 'running') {
    const url = j.urls?.get; if (!url) throw bad('The provider did not return a job id.');
    j = await until(async () => { const x = await json<RepPrediction>(await call(url, { signal, headers: bearer(secret) }, secret), secret); return repState(x) === 'running' ? null : x; }, 240_000, 2000, signal);
  }
  if (repState(j) === 'failed') throw repFail(j);
  return outUrls(j.output);
}

// ---------------------------------------------------------------- video
export interface VidInput { model: VideoModel; prompt: string; aspect: string; }
const TOKEN = (o: unknown) => JSON.stringify(o);
const sizeOf = (aspect: string, long: number) => { const d = dims(aspect, long, 2); return `${d.w}x${d.h}`; };

/** Starts a job and returns a text token that `pollVideoJob` understands. */
export async function startVideoJob(p: ProviderId, secret: string, i: VidInput): Promise<string> {
  const { model: m, prompt, aspect } = i;
  switch (p) {
    case 'openai': {
      const size = aspect === '9:16' ? '720x1280' : '1280x720';
      const j = await json<{ id?: string }>(await call('https://api.openai.com/v1/videos', { method: 'POST', headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ model: m.id, prompt, size, seconds: String(m.durations[0]) }) }, secret), secret);
      if (!j.id) throw bad('The provider did not return a job id.'); return j.id;
    }
    case 'luma': {
      const j = await json<{ id?: string }>(await call('https://api.lumalabs.ai/dream-machine/v1/generations', { method: 'POST', headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ prompt, model: m.id, aspect_ratio: aspect, resolution: '720p', duration: `${m.durations[0]}s` }) }, secret), secret);
      if (!j.id) throw bad('The provider did not return a job id.'); return j.id;
    }
    case 'minimax': {
      const j = await json<{ task_id?: string; base_resp?: { status_code?: number } }>(await call('https://api.minimax.io/v1/video_generation', { method: 'POST', headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ model: m.id, prompt, duration: m.durations[0], resolution: '768P' }) }, secret), secret);
      const c = j.base_resp?.status_code ?? 0;
      if (c === 1004 || c === 2049) throw perr('The provider rejected this key. Check that it is correct, active and allowed to use this model.', 401);
      if (c === 1008) throw perr('Your provider account has no credit left. Add credit with the provider, then try again.', 402);
      if (!j.task_id) throw bad('The provider did not return a job id.'); return j.task_id;
    }
    case 'zhipu': {
      const j = await json<{ id?: string }>(await call('https://open.bigmodel.cn/api/paas/v4/videos/generations', { method: 'POST', headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ model: m.id, prompt, size: sizeOf(aspect, 1920), quality: 'speed', fps: 30 }) }, secret), secret);
      if (!j.id) throw bad('The provider did not return a job id.'); return j.id;
    }
    case 'byteplus': {
      const j = await json<{ id?: string }>(await call('https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks', { method: 'POST', headers: { ...J, ...bearer(secret) }, body: JSON.stringify({ model: m.id, content: [{ type: 'text', text: `${prompt} --ratio ${aspect} --duration ${m.durations[0]}` }] }) }, secret), secret);
      if (!j.id) throw bad('The provider did not return a job id.'); return j.id;
    }
    case 'kling': {
      const j = await klingJson<{ code?: number; message?: string; data?: { task_id?: string } }>(await call(`${KLING}/v1/videos/text2video`, { method: 'POST', headers: await klingHeaders(secret), body: JSON.stringify({ model_name: m.id, prompt, duration: String(m.durations[0]), aspect_ratio: aspect, mode: 'std' }) }, secret), secret);
      if (!j.data?.task_id) throw bad('The provider did not return a job id.'); return j.data.task_id;
    }
    case 'fal': {
      const dur = m.params?.dur; const d = m.durations[0];
      const body: Record<string, unknown> = { prompt, aspect_ratio: aspect };
      if (dur === 's8') body.duration = `${d}s`; else if (dur === 'str') body.duration = String(d); else if (dur === 'num') body.duration = d;
      return TOKEN(await falSubmit(m.id, body, secret));
    }
    case 'replicate': {
      const j = await replicateStart(m.id, { prompt, aspect_ratio: aspect, duration: m.durations[0] }, secret);
      if (repState(j) === 'failed') throw repFail(j);
      if (repState(j) === 'done') { const u = outUrls(j.output)[0]; if (u) return TOKEN({ done: u }); }
      if (!j.urls?.get) throw bad('The provider did not return a job id.');
      return TOKEN({ get: j.urls.get });
    }
    default: throw bad('This provider cannot make videos.');
  }
}

export async function pollVideoJob(p: ProviderId, secret: string, op: string): Promise<PollResult> {
  switch (p) {
    case 'openai': {
      const j = await json<{ status?: string; error?: { message?: string } }>(await call(`https://api.openai.com/v1/videos/${op}`, { headers: bearer(secret) }, secret), secret);
      if (j.status === 'failed') return { state: 'failed', message: /moderation|policy|safety/i.test(j.error?.message ?? '') ? 'The video was blocked by the provider\'s safety filters. Try rewording the prompt.' : 'The provider could not create this video. Try different wording.' };
      return j.status === 'completed' ? { state: 'done', uri: `https://api.openai.com/v1/videos/${op}/content` } : { state: 'running' };
    }
    case 'luma': {
      const j = await json<{ state?: string; assets?: { video?: string } }>(await call(`https://api.lumalabs.ai/dream-machine/v1/generations/${op}`, { headers: bearer(secret) }, secret), secret);
      if (j.state === 'failed') return { state: 'failed', message: 'The provider could not create this video. Try different wording.' };
      return j.state === 'completed' && j.assets?.video ? { state: 'done', uri: j.assets.video } : { state: 'running' };
    }
    case 'minimax': {
      const j = await json<{ status?: string; file_id?: string }>(await call(`https://api.minimax.io/v1/query/video_generation?task_id=${encodeURIComponent(op)}`, { headers: bearer(secret) }, secret), secret);
      if (j.status === 'Fail') return { state: 'failed', message: 'The provider could not create this video. Try different wording.' };
      if (j.status !== 'Success' || !j.file_id) return { state: 'running' };
      const f = await json<{ file?: { download_url?: string } }>(await call(`https://api.minimax.io/v1/files/retrieve?file_id=${encodeURIComponent(j.file_id)}`, { headers: bearer(secret) }, secret), secret);
      return f.file?.download_url ? { state: 'done', uri: f.file.download_url } : { state: 'failed', message: 'The video could not be retrieved from the provider.' };
    }
    case 'zhipu': {
      const j = await json<{ task_status?: string; video_result?: { url?: string }[] }>(await call(`https://open.bigmodel.cn/api/paas/v4/async-result/${op}`, { headers: bearer(secret) }, secret), secret);
      if (j.task_status === 'FAIL') return { state: 'failed', message: 'The provider could not create this video. Try different wording.' };
      return j.task_status === 'SUCCESS' && j.video_result?.[0]?.url ? { state: 'done', uri: j.video_result[0].url } : { state: 'running' };
    }
    case 'byteplus': {
      const j = await json<{ status?: string; content?: { video_url?: string } }>(await call(`https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/${op}`, { headers: bearer(secret) }, secret), secret);
      if (j.status === 'failed' || j.status === 'cancelled') return { state: 'failed', message: 'The provider could not create this video. Try different wording.' };
      return j.status === 'succeeded' && j.content?.video_url ? { state: 'done', uri: j.content.video_url } : { state: 'running' };
    }
    case 'kling': {
      const j = await klingJson<{ code?: number; message?: string; data?: { task_status?: string; task_result?: { videos?: { url?: string }[] } } }>(await call(`${KLING}/v1/videos/text2video/${op}`, { headers: await klingHeaders(secret) }, secret), secret);
      if (j.data?.task_status === 'failed') return { state: 'failed', message: 'The provider could not create this video. Try different wording.' };
      const u = j.data?.task_result?.videos?.[0]?.url;
      return j.data?.task_status === 'succeed' && u ? { state: 'done', uri: u } : { state: 'running' };
    }
    case 'fal': {
      const st = JSON.parse(op) as { status_url: string; response_url: string };
      const r = await falPoll<{ video?: { url?: string } }>(st, secret);
      if (!r.done) return { state: 'running' };
      return r.result.video?.url ? { state: 'done', uri: r.result.video.url } : { state: 'failed', message: 'The provider returned no video.' };
    }
    case 'replicate': {
      const t = JSON.parse(op) as { get?: string; done?: string };
      if (t.done) return { state: 'done', uri: t.done };
      const j = await json<RepPrediction>(await call(t.get!, { headers: bearer(secret) }, secret), secret);
      if (repState(j) === 'failed') return { state: 'failed', message: repFail(j).message };
      const u = outUrls(j.output)[0];
      return repState(j) === 'done' && u ? { state: 'done', uri: u } : { state: 'running' };
    }
    default: return { state: 'failed', message: 'This provider cannot make videos.' };
  }
}

/** Provider links are temporary: download straight away. Only a few need the key. */
export async function downloadVideoFile(p: ProviderId, secret: string, uri: string): Promise<Blob> {
  const headers = p === 'openai' ? bearer(secret) : undefined;
  const r = await call(uri, { headers }, secret);
  if (!r.ok) throw await failure(r, secret);
  const b = await r.blob();
  return b.type.startsWith('video/') ? b : new Blob([b], { type: 'video/mp4' });
}
export type { ProviderErr };
