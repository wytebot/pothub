import { request } from '../security/api';
import { applyCrawl, buildSources, mergeHits, queryVariants, rankHits, resultsBlock, type CrawledPage, type WebHit, type WebResearch, type WebUpdate } from './research';

export type { WebHit, WebResearch, WebSource, WebUpdate } from './research';
export { resultsBlock };

/** Every answer may use web research; Pothub automatically searches when it can improve relevance. */
const NEEDS_WEB = /\b(latest|news|today|tonight|currently|current|right now|recent(ly)?|this (week|month|year)|newest|released?|price|prices|score|scores|weather|breaking|announce[ds]?|trending|search( the)? (web|online|internet)|look ?up|google|web search|research|sources?|cite|citations?|references?|20(2[5-9]|3\d))\b/i;
/** Search only when the prompt indicates freshness, weather/pricing/news, or an explicit lookup/citation request. */
export function shouldAutoWebSearch(prompt: string): boolean {
  const q = prompt.replace(/\s+/g, ' ').trim();
  if (!q || /\b(source code|research methodology|how to research)\b/i.test(q)) return false;
  return NEEDS_WEB.test(q);
}
export const WEB_CHANGED = 'web:changed';
export const webRemaining = () => Infinity;

/**
 * Searches (a past-month search too when the question is about something recent, both at once), then crawls the
 * best results: their page text and dates, a few relevant pages from the same sites, and each site's newest feed items.
 * `sources` lists the sites that contributed, for showing under the answer. Throws only if every search failed.
 */
export async function webResearch(query: string): Promise<WebResearch> {
  const runs = await Promise.allSettled(queryVariants(query).map((v) => request<{ results: WebHit[] }>(`/api/search?q=${encodeURIComponent(v.q)}${v.fresh ? `&fresh=${v.fresh}` : ''}`, undefined, 8_000)));
  if (runs.every((r) => r.status === 'rejected')) throw (runs[0] as PromiseRejectedResult).reason;
  const hits = rankHits(query, mergeHits(runs.map((r) => (r.status === 'fulfilled' && Array.isArray(r.value.results) ? r.value.results : [])), 20, 2), 10);
  if (!hits.length) return { hits: [], updates: [], sources: [] };
  let pages: CrawledPage[] = []; let updates: WebUpdate[] = [];
  try {
    const c = await request<{ pages?: CrawledPage[]; updates?: WebUpdate[] }>('/api/crawl', { urls: hits.slice(0, 4).map((h) => h.url), query, depth: 1 }, 10_000);
    pages = Array.isArray(c.pages) ? c.pages : []; updates = Array.isArray(c.updates) ? c.updates : [];
  } catch { /* the search results still stand without page text */ }
  const all = applyCrawl(hits, pages);
  // Opt-in publisher excerpts are shared, compact, expiring, and relevance-scored server-side.
  try { const pub = await request<{results?: WebHit[]}>(`/api/publishers/search?q=${encodeURIComponent(query)}`, undefined, 5_000); const publisherHits = Array.isArray(pub.results) ? pub.results.slice(0, 6) : []; const byUrl = new Map(publisherHits.map(h => [h.url.replace(/\/$/, '').toLowerCase(), h])); const enriched = all.map(h => { const p = byUrl.get(h.url.replace(/\/$/, '').toLowerCase()); return p ? { ...h, text: h.text || p.text, snippet: h.snippet || p.snippet, site: h.site || p.site } : h; }); const merged = mergeHits([enriched, publisherHits], 12, 3); const ranked = rankHits(query, merged, 12); return { hits: ranked, updates, sources: buildSources(ranked) }; } catch { return { hits: all, updates, sources: buildSources(all) }; }
}
