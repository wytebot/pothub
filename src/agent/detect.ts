import { call, failure } from '../models/providers';
import { ENDPOINTS, PROVIDERS, authHeaders } from '../models/providerInfo';
import { defaultKeys, getSecret, type ProviderId } from '../vault/vault';
import { textModelsFrom, type TextModel } from '../models/text';
export interface ListedModel { id: string; methods: string[]; }
export interface Catalog { texts: TextModel[]; verified: ProviderId[]; unverified: ProviderId[]; at: number; }
const TTL = 15 * 60_000; const LS = 'agent.text.catalog.v2'; const LS_TTL = 6 * 3_600_000;
const mem = new Map<string, { at: number; models: ListedModel[] }>();
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const timeoutSignal = (signal?: AbortSignal) => signal ? ('any' in AbortSignal ? (AbortSignal as unknown as { any(s: AbortSignal[]): AbortSignal }).any([signal, AbortSignal.timeout(6000)]) : signal) : AbortSignal.timeout(6000);
export async function listProviderModels(provider: ProviderId, secret: string, signal?: AbortSignal): Promise<ListedModel[]> {
  const sig = timeoutSignal(signal);
  if (provider !== 'gemini') {
    const r = await call(provider === 'anthropic' ? `${ENDPOINTS.anthropic.models}?limit=1000` : ENDPOINTS[provider].models, { headers: authHeaders(provider, secret), signal: sig }, secret);
    if (!r.ok) throw await failure(r, secret);
    const j = (await r.json()) as { data?: { id: string; type?: string }[] } | { id: string; type?: string }[];
    const rows = Array.isArray(j) ? j : (j.data ?? []);
    // Together lists every kind of model in one array; its "type" says which are chat models.
    return rows.filter((m) => typeof m.id === 'string').map((m) => ({ id: m.id, methods: m.type ? [m.type] : [] }));
  }
  const out: ListedModel[] = []; let token = '';
  for (let page = 0; page < 4; page++) {
    const r = await call(`${GEMINI}/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, { headers: { 'x-goog-api-key': secret }, signal: sig }, secret);
    if (!r.ok) throw await failure(r, secret);
    const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string };
    for (const m of j.models ?? []) if (m.supportedGenerationMethods?.includes('generateContent')) out.push({ id: m.name.replace(/^models\//, ''), methods: m.supportedGenerationMethods ?? [] });
    if (!j.nextPageToken) break; token = j.nextPageToken;
  }
  return out;
}
export function buildCatalog(lists: Partial<Record<ProviderId, ListedModel[]>>, connected: ProviderId[], now = Date.now(), fallback: Partial<Record<ProviderId, ListedModel[]>> = {}): Catalog {
  const verified = connected.filter((p) => lists[p]); const unverified = connected.filter((p) => !lists[p] && PROVIDERS[p].lists);
  const texts: TextModel[] = []; for (const p of connected) { const list = lists[p] ?? fallback[p]; if (list) texts.push(...textModelsFrom(p, list)); }
  return { texts, verified, unverified, at: now };
}
const connectedProviders = (): ProviderId[] => [...new Set(defaultKeys('text').map((k) => k.provider))];
const restrict = (c: Catalog): Catalog => { const allowed = new Set(defaultKeys('text').map((k) => k.provider)); return { ...c, texts: c.texts.filter((m) => allowed.has(m.provider)) }; };
export const cachedCatalog = (): Catalog => last ?? restrict(buildCatalog({}, connectedProviders()));
/** Fast path: use persisted provider model lists immediately, avoiding live model-list requests on chat startup. */
export const quickCatalog = (): Catalog | null => { const connected = connectedProviders(); const store = persisted(); const lists: Partial<Record<ProviderId, ListedModel[]>> = {}; let found = false; for (const p of connected) { const key = defaultKeys('text').find((k) => k.provider === p); if (!key) continue; const hit = mem.get(key.id); const saved = hit && Date.now() - hit.at < LS_TTL ? hit : store[key.id]; if (saved && Date.now() - saved.at < LS_TTL) { lists[p] = saved.models; found = true; } } const c = restrict(buildCatalog(lists, connected, Date.now())); return found && c.texts.length ? c : null; };
function persisted(): Record<string, { at: number; models: ListedModel[] }> { try { return JSON.parse(localStorage.getItem(LS) ?? '{}'); } catch { return {}; } }
function persist(id: string, v: { at: number; models: ListedModel[] }) { try { const p = persisted(); p[id] = v; localStorage.setItem(LS, JSON.stringify(p)); } catch { /* local storage unavailable */ } }
export const dropCatalogCache = () => { mem.clear(); last = null; try { localStorage.removeItem(LS); } catch { /* ignore */ } };
export async function refreshCatalog(o: { force?: boolean; signal?: AbortSignal; onProvider?: (p: ProviderId, r: { count: number; source: 'live' | 'cache' | 'builtin' | 'unavailable'; reason?: string }) => void } = {}): Promise<Catalog> {
  if (inflight && !o.force) return inflight;
  const run = (async () => {
    const connected = connectedProviders(); const lists: Partial<Record<ProviderId, ListedModel[]>> = {};
    await Promise.all(connected.map(async (p) => {
      const key = defaultKeys('text').find((k) => k.provider === p); if (!key) return;
      const hit = mem.get(key.id); if (hit && !o.force && Date.now() - hit.at < TTL) { lists[p] = hit.models; o.onProvider?.(p, { count: hit.models.length, source: 'cache' }); return; }
      try { const models = await listProviderModels(p, await getSecret(key.id), o.signal); const v = { at: Date.now(), models }; mem.set(key.id, v); persist(key.id, v); lists[p] = models; o.onProvider?.(p, { count: models.length, source: 'live' }); }
      catch (e) { const old = persisted()[key.id]; if (old && Date.now() - old.at < LS_TTL) { lists[p] = old.models; o.onProvider?.(p, { count: old.models.length, source: 'cache', reason: e instanceof Error ? e.message : undefined }); } else o.onProvider?.(p, { count: 0, source: 'unavailable', reason: e instanceof Error ? e.message : 'unreachable' }); }
    }));
    last = restrict(buildCatalog(lists, connected, Date.now())); return last;
  })(); inflight = run; try { return await run; } finally { if (inflight === run) inflight = null; }
}
let last: Catalog | null = null; let inflight: Promise<Catalog> | null = null;
