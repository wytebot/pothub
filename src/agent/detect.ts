import { call, failure } from '../models/providers';
import { PROVIDERS } from '../models/providerInfo';
import { IMAGE_MODELS, VIDEO_MODELS, type ImageModel, type VideoModel } from '../models/registry';
import { getSecret, listKeys, usableKey, type ProviderId } from '../vault/vault';

export interface ListedModel { id: string; methods: string[]; }
export interface Catalog {
  image: ImageModel[]; video: VideoModel[];
  /** cheapest current text model on the Gemini key, used only for optional prompt enhancement */
  text?: { provider: 'gemini'; id: string };
  verified: ProviderId[];   // provider answered with its live model list
  unverified: ProviderId[]; // could not be checked; seed models for it are kept as-is
  at: number;
}
const TTL = 15 * 60_000; const LS = 'agent.catalog.v1'; const LS_TTL = 6 * 3_600_000;
const mem = new Map<string, { at: number; models: ListedModel[] }>();
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

export async function listProviderModels(provider: ProviderId, secret: string, signal?: AbortSignal): Promise<ListedModel[]> {
  const sig = signal ? ('any' in AbortSignal ? (AbortSignal as unknown as { any(s: AbortSignal[]): AbortSignal }).any([signal, AbortSignal.timeout(6000)]) : signal) : AbortSignal.timeout(6000);
  if (provider === 'openai') {
    const r = await call('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${secret}` }, signal: sig }, secret);
    if (!r.ok) throw await failure(r, secret);
    return ((await r.json()) as { data?: { id: string }[] }).data?.map((m) => ({ id: m.id, methods: [] })) ?? [];
  }
  const out: ListedModel[] = []; let token = '';
  for (let page = 0; page < 4; page++) {
    const r = await call(`${GEMINI}/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, { headers: { 'x-goog-api-key': secret }, signal: sig }, secret);
    if (!r.ok) throw await failure(r, secret);
    const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string };
    for (const m of j.models ?? []) out.push({ id: m.name.replace(/^models\//, ''), methods: m.supportedGenerationMethods ?? [] });
    if (!j.nextPageToken) break; token = j.nextPageToken;
  }
  return out;
}

const pretty = (id: string, brand: string) => `${brand} ${id.replace(/^gemini-/, 'Gemini ').replace(/^gpt-image-/, 'GPT Image ').replace(/^veo-/, 'Veo ').replace(/-preview.*$/, ' (preview)').replace(/-(generate|001)\b/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()}`;
const versionOf = (id: string) => Number(id.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0);
const GEMINI_ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

/** Pure: turns provider model lists + the seed registry into what is really usable right now. */
export function buildCatalog(lists: Partial<Record<ProviderId, ListedModel[]>>, connected: ProviderId[], now = Date.now()): Catalog {
  const verified = connected.filter((p) => lists[p]); const unverified = connected.filter((p) => !lists[p] && PROVIDERS[p].lists);
  const has = (p: ProviderId, id: string) => lists[p]!.some((m) => m.id === id);
  const image: ImageModel[] = []; const video: VideoModel[] = [];
  for (const m of IMAGE_MODELS) if (connected.includes(m.provider) && (!lists[m.provider] || m.unlisted || has(m.provider, m.id))) image.push(m);
  for (const m of VIDEO_MODELS) if (connected.includes(m.provider) && (!lists[m.provider] || m.unlisted || has(m.provider, m.id))) video.push(m);
  const seen = new Set([...image, ...video].map((m) => m.id));
  const g = lists.gemini;
  if (g) for (const m of g) {
    if (seen.has(m.id) || /-latest$/.test(m.id)) continue;
    if (/^gemini-[\w.-]*image[\w.-]*$/.test(m.id) && m.methods.includes('generateContent') && !/(exp|tts|embed)/.test(m.id))
      image.push({ id: m.id, provider: 'gemini', name: pretty(m.id, 'Google'), tasks: ['text-to-image'], aspects: GEMINI_ASPECTS, maxBatch: 1, outputFormats: ['png'], negativePrompt: false, seed: false, speed: /flash|lite/.test(m.id) ? 3 : 1, quality: /pro/.test(m.id) ? 3 : 2, discovered: true });
    else if (/^veo-/.test(m.id) && m.methods.includes('predictLongRunning'))
      video.push({ id: m.id, provider: 'gemini', name: pretty(m.id, 'Google'), tasks: ['text-to-video'], aspects: ['16:9'], durations: [8], speed: /fast|lite/.test(m.id) ? 3 : 1, quality: /lite/.test(m.id) ? 1 : /fast/.test(m.id) ? 2 : 3, discovered: true });
  }
  const o = lists.openai;
  if (o) for (const m of o) if (!seen.has(m.id) && /^gpt-image-\d/.test(m.id))
    image.push({ id: m.id, provider: 'openai', name: pretty(m.id, 'OpenAI'), tasks: ['text-to-image'], aspects: ['1:1', '3:2', '2:3'], maxBatch: 4, outputFormats: ['png'], negativePrompt: false, seed: false, speed: 1, quality: 3, discovered: true });
  let text: Catalog['text'];
  if (g) {
    const flash = g.filter((m) => m.methods.includes('generateContent') && /^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(m.id)).sort((a, b) => versionOf(b.id) - versionOf(a.id) || Number(/lite/.test(b.id)) - Number(/lite/.test(a.id)));
    if (flash[0]) text = { provider: 'gemini', id: flash[0].id };
  }
  return { image, video, text, verified, unverified, at: now };
}

/** Instant, no network: what the seed registry offers for these providers (used until a live check finishes). */
export const seedCatalog = (connected: ProviderId[]): Catalog => buildCatalog({}, connected);

let last: Catalog | null = null; let inflight: Promise<Catalog> | null = null;
const connectedProviders = (): ProviderId[] => [...new Set(listKeys().filter((k) => k.status !== 'invalid').map((k) => k.provider))];
export const cachedCatalog = (): Catalog => last ?? seedCatalog(connectedProviders());

function persisted(): Record<string, { at: number; models: ListedModel[] }> { try { return JSON.parse(localStorage.getItem(LS) ?? '{}'); } catch { return {}; } }
function persist(id: string, v: { at: number; models: ListedModel[] }) { try { const p = persisted(); p[id] = v; localStorage.setItem(LS, JSON.stringify(p)); } catch { /* storage full or blocked */ } }
export const dropCatalogCache = () => { mem.clear(); last = null; try { localStorage.removeItem(LS); } catch { /* ignore */ } };

/**
 * Asks every connected provider (in parallel, 6 s cap each) which models it offers right now.
 * Never throws: a provider that cannot be checked falls back to the last known list, then to the seed registry.
 * onProvider lets the terminal show each provider the moment it answers.
 */
export async function refreshCatalog(o: { force?: boolean; signal?: AbortSignal; onProvider?: (p: ProviderId, r: { count: number; source: 'live' | 'cache' | 'builtin' | 'unavailable'; reason?: string }) => void } = {}): Promise<Catalog> {
  if (inflight && !o.force) return inflight;
  const run = (async () => {
    const connected = connectedProviders(); const lists: Partial<Record<ProviderId, ListedModel[]>> = {};
    await Promise.all(connected.map(async (p) => {
      const key = usableKey(p); if (!key) return;
      if (!PROVIDERS[p].lists) { o.onProvider?.(p, { count: IMAGE_MODELS.filter((m) => m.provider === p).length + VIDEO_MODELS.filter((m) => m.provider === p).length, source: 'builtin' }); return; }
      const hit = mem.get(key.id);
      if (hit && !o.force && Date.now() - hit.at < TTL) { lists[p] = hit.models; o.onProvider?.(p, { count: hit.models.length, source: 'cache' }); return; }
      try {
        const models = await listProviderModels(p, await getSecret(key.id), o.signal);
        const v = { at: Date.now(), models }; mem.set(key.id, v); persist(key.id, v); lists[p] = models; o.onProvider?.(p, { count: models.length, source: 'live' });
      } catch (e) {
        const old = persisted()[key.id];
        if (old && Date.now() - old.at < LS_TTL) { lists[p] = old.models; o.onProvider?.(p, { count: old.models.length, source: 'cache', reason: e instanceof Error ? e.message : undefined }); }
        else o.onProvider?.(p, { count: 0, source: 'unavailable', reason: e instanceof Error ? e.message : 'unreachable' });
      }
    }));
    last = buildCatalog(lists, connected); return last;
  })();
  inflight = run; try { return await run; } finally { if (inflight === run) inflight = null; }
}
