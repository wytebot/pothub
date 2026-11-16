import { call, failure } from './providers';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Starts an async job and returns the provider's operation name. */
export async function startVideo(secret: string, i: { model: string; prompt: string; aspect: string }): Promise<string> {
  const r = await call(`${BASE}/models/${i.model}:predictLongRunning`, { method: 'POST', headers: { 'x-goog-api-key': secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ instances: [{ prompt: i.prompt }], parameters: { aspectRatio: i.aspect } }) }, secret);
  if (!r.ok) throw await failure(r, secret);
  const j = await r.json() as { name?: string };
  if (!j.name) throw new Error('The provider did not return a job id.');
  return j.name;
}
export type PollResult = { state: 'running' } | { state: 'done'; uri: string } | { state: 'failed'; message: string };
export async function pollVideo(secret: string, op: string): Promise<PollResult> {
  const r = await call(`${BASE}/${op}`, { headers: { 'x-goog-api-key': secret } }, secret);
  if (!r.ok) throw await failure(r, secret);
  const j = await r.json() as { done?: boolean; error?: { message?: string }; response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[]; raiMediaFilteredReasons?: string[] } } };
  if (!j.done) return { state: 'running' };
  if (j.error) return { state: 'failed', message: 'The provider could not create this video. Try different wording.' };
  const uri = j.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) return { state: 'failed', message: 'The video was blocked by the provider\'s safety filters. Try rewording the prompt.' };
  return { state: 'done', uri };
}
/** Provider URLs are temporary: download immediately, retrying with backoff. */
export async function downloadVideo(secret: string, uri: string): Promise<Blob> {
  let last: unknown;
  for (let n = 0; n < 3; n++) {
    try { const r = await call(uri, { headers: { 'x-goog-api-key': secret } }, secret); if (!r.ok) throw await failure(r, secret); return await r.blob(); }
    catch (e) { last = e; await new Promise((res) => setTimeout(res, 1500 * (n + 1))); }
  }
  throw last instanceof Error ? last : new Error('The video could not be downloaded. Its link may have expired; generate it again.');
}
