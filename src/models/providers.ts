import type { ProviderId } from '../vault/vault';
import { IMAGE_MODELS } from './registry';
import { generateWithAdapter, testProviderKey } from './adapters';
import { blobFromB64, call, failure, perr, type ProviderErr } from './http';

export { PROVIDERS } from './providerInfo';
export { call, failure };
export type { ProviderErr };
export interface TestResult { status: 'ok' | 'invalid' | 'error'; message: string; }

export async function testKey(p: ProviderId, secret: string): Promise<TestResult> {
  try {
    if (p === 'openai' || p === 'gemini') {
      const r = p === 'openai'
        ? await call('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${secret}` } }, secret)
        : await call('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': secret } }, secret);
      if (r.ok) return { status: 'ok', message: 'Connected. The key is valid.' };
      if ([400, 401, 403].includes(r.status)) return { status: 'invalid', message: 'The provider rejected this key.' };
      return { status: 'error', message: (await failure(r, secret)).message };
    }
    const t = await testProviderKey(p, secret);
    if (t.status === 'ok') return { status: 'ok', message: 'Connected. The key was accepted.' };
    if (t.status === 'invalid') return { status: 'invalid', message: 'The provider rejected this key.' };
    return { status: 'error', message: t.message ?? 'The key could not be checked.' };
  } catch (e) { return { status: 'error', message: e instanceof Error ? e.message : 'Test failed.' }; }
}

export interface GenInput { model: string; prompt: string; /** empty keeps the shape of a reference photo */ aspect: string; count: number; signal?: AbortSignal; /** photos to edit or use as a reference (Google Gemini image models only) */ refs?: { mime: string; data: string }[]; }
export interface GenImage { blob: Blob; mime: string; }
const OPENAI_SIZE: Record<string, string> = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' };

export async function generateImages(p: ProviderId, secret: string, i: GenInput): Promise<GenImage[]> {
  if (p === 'openai') {
    const r = await call('https://api.openai.com/v1/images/generations', { method: 'POST', signal: i.signal, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: i.model, prompt: i.prompt, n: i.count, size: OPENAI_SIZE[i.aspect] }) }, secret);
    if (!r.ok) throw await failure(r, secret);
    const j = await r.json() as { data?: { b64_json?: string }[] };
    const out = (j.data ?? []).filter((d) => d.b64_json).map((d) => ({ blob: blobFromB64(d.b64_json!, 'image/png'), mime: 'image/png' }));
    if (!out.length) throw new Error('The provider returned no image.');
    return out;
  }
  if (p === 'gemini') {
    const r = await call(`https://generativelanguage.googleapis.com/v1beta/models/${i.model}:generateContent`, { method: 'POST', signal: i.signal, headers: { 'x-goog-api-key': secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [...(i.refs ?? []).map((r) => ({ inlineData: { mimeType: r.mime, data: r.data } })), { text: i.prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], ...(i.aspect ? { imageConfig: { aspectRatio: i.aspect } } : {}) } }) }, secret);
    if (!r.ok) throw await failure(r, secret);
    const j = await r.json() as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] };
    const part = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData);
    if (!part?.inlineData) throw new Error('The model returned no image. The prompt may have been blocked by safety filters; try rewording it.');
    return [{ blob: blobFromB64(part.inlineData.data, part.inlineData.mimeType), mime: part.inlineData.mimeType }];
  }
  const model = IMAGE_MODELS.find((m) => m.provider === p && m.id === i.model);
  if (!model) throw perr('That model is no longer available. Pick another one.');
  return generateWithAdapter(p, secret, { model, prompt: i.prompt, aspect: i.aspect, count: i.count, signal: i.signal });
}
