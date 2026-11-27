import { request } from '../security/api';
import { applyCrawl, buildSources, mergeHits, queryVariants, rankHits, resultsBlock, type CrawledPage, type WebHit, type WebResearch, type WebUpdate } from './research';

export type { WebHit, WebResearch, WebSource, WebUpdate } from './research';
const webHost = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
export { resultsBlock };

/** Intent detection for web-assisted answers. Search is used when facts may be stale,
 * when the request explicitly asks for research, or when technical implementation/debugging
 * benefits from current documentation, commands, packages, and known fixes. */
const NEEDS_WEB = /\b(latest|news|today|tonight|currently|current|right now|recent(ly)?|this (week|month|year)|newest|released?|price|prices|score|scores|weather|breaking|announce[ds]?|trending|search( the)? (web|online|internet)|look ?up|google|web search|research|sources?|cite|citations?|references?|20(2[5-9]|3\d))\b/i;
const TECH_WEB = /\b(build|create|develop|write|generate|make|implement|wire|integrate|debug|troubleshoot|fix|repair|upgrade|refactor|deploy|production[- ]ready|scaffold|configure|setup|set up|install|migrate|optimize|secure|test|benchmark|compare|recommend|choose|best)\b/i;
const TECH_CONTEXT = /\b(app|application|website|web app|mobile|android|ios|react|vite|typescript|javascript|node|npm|api|sdk|framework|library|package|database|firebase|firestore|github|vercel|capacitor|flutter|python|server|backend|frontend|terminal|compiler|build|deployment|code|coding|program|software|engine|tool|integration|provider|model)\b/i;
const EXPLICIT_WEB = /\b(search (the )?(web|internet|online)|web search|look ?up|deep research|research (this|that|the|it|about)|find (current|latest|recent)|with sources|cite sources)\b/i;
/** Automatically research requests where web evidence materially improves correctness. */
export function shouldAutoWebSearch(prompt: string): boolean {
  const q = prompt.replace(/\s+/g, ' ').trim();
  if (!q || /\b(research methodology|how to research)\b/i.test(q)) return false;
  if (EXPLICIT_WEB.test(q) || NEEDS_WEB.test(q)) return true;
  return TECH_WEB.test(q) && TECH_CONTEXT.test(q);
}
/** Returns only explicitly enabled, verified configured sites from this device's site settings. */
export function consentedConfiguredSites(raw: string): string[] {
  try { const sites = JSON.parse(raw || '[]'); if (!Array.isArray(sites)) return []; const seen = new Set<string>(); return sites.filter((s) => s && s.verified === true && s.crawl === true && typeof s.url === 'string').flatMap((s) => { try { const u = new URL(s.url); if (!['https:', 'http:'].includes(u.protocol) || seen.has(u.origin)) return []; seen.add(u.origin); return [u.toString()]; } catch { return []; } }).slice(0, 2); } catch { return []; }
}
export const WEB_CHANGED = 'web:changed';
export const webRemaining = () => Infinity;

/**
 * Searches (a past-month search too when the question is about something recent, both at once), then crawls the
 * best results: their page text and dates, a few relevant pages from the same sites, and each site's newest feed items.
 * `sources` lists the sites that contributed, for showing under the answer. Throws only if every search failed.
 */

/** Extracts explicit URLs from a prompt and reads the linked pages directly before answering. */
export function extractPromptUrls(prompt: string): string[] {
  const found = new Set<string>();
  const re = /https?:\/\/[^\s<>"'`]+/gi;
  for (const match of prompt.matchAll(re)) {
    const raw = match[0].replace(/[,.!?;\]}]+$/g, '');
    try { const u = new URL(raw); if (u.protocol === 'http:' || u.protocol === 'https:') found.add(u.toString()); } catch { /* ignore malformed links */ }
  }
  return [...found].slice(0, 8);
}

export async function readPromptLinks(prompt: string, onStage?: (stage: string) => void): Promise<WebResearch> {
  const urls = extractPromptUrls(prompt);
  if (!urls.length) return { hits: [], updates: [], sources: [] };
  onStage?.(`Reading ${urls.length} link(s) directly and following relevant pages…`);
  const c = await request<{ pages?: CrawledPage[]; updates?: WebUpdate[] }>('/api/crawl', { urls, query: prompt.slice(0, 300), depth: 2 }, 25_000);
  const pages = Array.isArray(c.pages) ? c.pages : [];
  const hits: WebHit[] = pages.map(p => ({ title: p.title || p.url, url: p.finalUrl || p.url, snippet: p.description || '', text: p.text, published: p.published, updated: p.updated, site: p.site, via: p.depth === 2 ? p.via : undefined }));
  onStage?.(`Read ${pages.length} page(s) from supplied link(s)`);
  return { hits, updates: Array.isArray(c.updates) ? c.updates : [], sources: buildSources(hits) };
}

export async function webResearch(query: string, onStage?: (stage: string) => void, consentedSiteUrls: string[] = []): Promise<WebResearch> {
  const variants = queryVariants(query);
  onStage?.(`Deep research plan: ${variants.length} targeted searches`);
  const runs = await Promise.allSettled(variants.map(async (v, i) => {
    onStage?.(`Searching source ${i + 1}/${variants.length}: ${v.q.slice(0, 90)}${v.fresh ? ` · freshness ${v.fresh}` : ''}`);
    const result = await request<{ results: WebHit[] }>(`/api/search?q=${encodeURIComponent(v.q)}${v.fresh ? `&fresh=${v.fresh}` : ''}`, undefined, 12_000);
    onStage?.(`Search ${i + 1}/${variants.length} returned ${Array.isArray(result.results) ? result.results.length : 0} results`);
    return result;
  }));
  if (runs.every((r) => r.status === 'rejected')) throw (runs[0] as PromiseRejectedResult).reason;
  const hits = rankHits(query, mergeHits(runs.map((r) => (r.status === 'fulfilled' && Array.isArray(r.value.results) ? r.value.results : [])), 30, 3), 14);
  if (!hits.length) { onStage?.('Research found no usable results'); return { hits: [], updates: [], sources: [] }; }
  onStage?.(`Reading ${Math.min(6, hits.length)} high-relevance pages${consentedSiteUrls.length ? ` and ${Math.min(2, consentedSiteUrls.length)} consented configured site(s)` : ''}, following relevant links…`);
  let pages: CrawledPage[] = []; let updates: WebUpdate[] = [];
  try {
    const urls = [...new Set([...hits.slice(0, 6).map((h) => h.url), ...consentedSiteUrls.slice(0, 2)])].slice(0, 8);
    const c = await request<{ pages?: CrawledPage[]; updates?: WebUpdate[] }>('/api/crawl', { urls, query, depth: 2 }, 18_000);
    pages = Array.isArray(c.pages) ? c.pages : []; updates = Array.isArray(c.updates) ? c.updates : []; onStage?.(`Read ${pages.length} page(s)${updates.length ? ` and collected ${updates.length} recent updates` : ''}`);
  } catch { /* the search results still stand without page text */ }
  const all = applyCrawl(hits, pages);
  // User-owned configured sites are crawlable only when both verified and explicitly opted in.
  const consentHosts = new Set(consentedSiteUrls.map((u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }).filter(Boolean));
  const consentPages: WebHit[] = pages.filter(p => p.depth !== 2 && consentHosts.has((p.site || (() => { try { return new URL(p.finalUrl || p.url).hostname; } catch { return ''; } })()).toLowerCase())).map(p => ({ title: p.title || p.url, url: p.finalUrl || p.url, snippet: p.description || '', text: p.text, published: p.published, updated: p.updated, site: p.site || webHost(p.url) }));
  const supplemented = mergeHits([all, consentPages], 20, 3);
  // Opt-in publisher excerpts are shared, compact, expiring, and relevance-scored server-side.
  try { const pub = await request<{results?: WebHit[]}>(`/api/publishers/search?q=${encodeURIComponent(query)}`, undefined, 5_000); const publisherHits = Array.isArray(pub.results) ? pub.results.slice(0, 8) : []; const byUrl = new Map(publisherHits.map(h => [h.url.replace(/\/$/, '').toLowerCase(), h])); const enriched = supplemented.map(h => { const p = byUrl.get(h.url.replace(/\/$/, '').toLowerCase()); return p ? { ...h, text: h.text || p.text, snippet: h.snippet || p.snippet, site: h.site || p.site } : h; }); const merged = mergeHits([enriched, publisherHits], 20, 3); const ranked = rankHits(query, merged, 16); const keepConsent = consentPages.filter(h => !ranked.some(r => r.url === h.url)).slice(0, 2); const output = [...ranked, ...keepConsent].slice(0, 16); return { hits: output, updates, sources: buildSources(output) }; } catch { const ranked = rankHits(query, supplemented, 16); const keepConsent = consentPages.filter(h => !ranked.some(r => r.url === h.url)).slice(0, 2); const output = [...ranked, ...keepConsent].slice(0, 16); return { hits: output, updates, sources: buildSources(output) }; }
}
