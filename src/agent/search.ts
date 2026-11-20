import { request } from '../security/api';
import { applyCrawl, buildSources, mergeHits, queryVariants, resultsBlock, type CrawledPage, type WebHit, type WebResearch, type WebUpdate } from './research';

export type { WebHit, WebResearch, WebSource, WebUpdate } from './research';
export { resultsBlock };

/** Every answer may use web research; Pothub automatically searches when it can improve relevance. */
export function shouldAutoWebSearch(_prompt: string): boolean { return true; }
export const WEB_CHANGED = 'web:changed';
export const webRemaining = () => Infinity;

/**
 * Searches (a past-month search too when the question is about something recent, both at once), then crawls the
 * best results: their page text and dates, a few relevant pages from the same sites, and each site's newest feed items.
 * `sources` lists the sites that contributed, for showing under the answer. Throws only if every search failed.
 */
export async function webResearch(query: string): Promise<WebResearch> {
  const runs = await Promise.allSettled(queryVariants(query).map((v) => request<{ results: WebHit[] }>(`/api/search?q=${encodeURIComponent(v.q)}${v.fresh ? `&fresh=${v.fresh}` : ''}`, undefined, 20_000)));
  if (runs.every((r) => r.status === 'rejected')) throw (runs[0] as PromiseRejectedResult).reason;
  const hits = mergeHits(runs.map((r) => (r.status === 'fulfilled' && Array.isArray(r.value.results) ? r.value.results : [])), 10, 2);
  if (!hits.length) return { hits: [], updates: [], sources: [] };
  let pages: CrawledPage[] = []; let updates: WebUpdate[] = [];
  try {
    const c = await request<{ pages?: CrawledPage[]; updates?: WebUpdate[] }>('/api/crawl', { urls: hits.slice(0, 6).map((h) => h.url), query, depth: 2 }, 30_000);
    pages = Array.isArray(c.pages) ? c.pages : []; updates = Array.isArray(c.updates) ? c.updates : [];
  } catch { /* the search results still stand without page text */ }
  const all = applyCrawl(hits, pages);
  return { hits: all, updates, sources: buildSources(all) };
}
