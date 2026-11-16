import type { ProviderId } from '../vault/vault';

export const PROVIDERS: Record<ProviderId, { name: string; billing: string }> = {
  openai: { name: 'OpenAI', billing: 'Charged to your OpenAI account per image. Some image models require organization verification on OpenAI.' },
  gemini: { name: 'Google Gemini', billing: 'Charged to your Google AI Studio / Cloud billing account. Free-tier limits and regional availability are set by Google.' },
};
export interface TestResult { status: 'ok' | 'invalid' | 'error'; message: string; }
export type ProviderErr = Error & { status?: number };
const perr = (m: string, status?: number): ProviderErr => Object.assign(new Error(m), { status });
const scrub = (t: string, secret: string) => t.split(secret).join('••••');

export async function call(url: string, init: RequestInit, secret: string): Promise<Response> {
  try { return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(120_000) }); }
  catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Cancelled.');
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('The provider took too long to respond. Try again.');
    throw new Error(scrub('Could not reach the provider. Check your connection and try again.', secret));
  }
}
export async function failure(r: Response, secret: string): Promise<ProviderErr> {
  let detail = '';
  try { const j = await r.json(); detail = scrub(String(j?.error?.message ?? ''), secret); } catch { /* ignore */ }
  if (r.status === 401 || r.status === 403) return perr('The provider rejected this key. Check that it is correct, active and allowed to use this model.', r.status);
  if (r.status === 429) return perr('Rate limit or quota reached on your provider account. Wait a moment or check your plan and billing.', r.status);
  if (r.status >= 500) return perr('The provider is having problems right now. Try again shortly.', r.status);
  return perr(detail || `The provider returned an error (${r.status}).`, r.status);
}
const fromB64 = (b64: string, mime: string) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); };

export async function testKey(p: ProviderId, secret: string): Promise<TestResult> {
  try {
    const r = p === 'openai'
      ? await call('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${secret}` } }, secret)
      : await call('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': secret } }, secret);
    if (r.ok) return { status: 'ok', message: 'Connected. The key is valid.' };
    if ([400, 401, 403].includes(r.status)) return { status: 'invalid', message: 'The provider rejected this key.' };
    return { status: 'error', message: (await failure(r, secret)).message };
  } catch (e) { return { status: 'error', message: e instanceof Error ? e.message : 'Test failed.' }; }
}

export interface GenInput { model: string; prompt: string; aspect: string; count: number; signal?: AbortSignal; }
export interface GenImage { blob: Blob; mime: string; }
const OPENAI_SIZE: Record<string, string> = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' };

export async function generateImages(p: ProviderId, secret: string, i: GenInput): Promise<GenImage[]> {
  if (p === 'openai') {
    const r = await call('https://api.openai.com/v1/images/generations', { method: 'POST', signal: i.signal, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: i.model, prompt: i.prompt, n: i.count, size: OPENAI_SIZE[i.aspect] }) }, secret);
    if (!r.ok) throw await failure(r, secret);
    const j = await r.json() as { data?: { b64_json?: string }[] };
    const out = (j.data ?? []).filter((d) => d.b64_json).map((d) => ({ blob: fromB64(d.b64_json!, 'image/png'), mime: 'image/png' }));
    if (!out.length) throw new Error('The provider returned no image.');
    return out;
  }
  const r = await call(`https://generativelanguage.googleapis.com/v1beta/models/${i.model}:generateContent`, { method: 'POST', signal: i.signal, headers: { 'x-goog-api-key': secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: i.prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: i.aspect } } }) }, secret);
  if (!r.ok) throw await failure(r, secret);
  const j = await r.json() as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] };
  const part = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData);
  if (!part?.inlineData) throw new Error('The model returned no image. The prompt may have been blocked by safety filters; try rewording it.');
  return [{ blob: fromB64(part.inlineData.data, part.inlineData.mimeType), mime: part.inlineData.mimeType }];
}
