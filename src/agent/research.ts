// Pure helpers for web research (no imports, so they are cheap to test): which searches to run, how to merge
// them, how to lay the findings out for the model, and which source sites to show under the answer.

export interface WebHit { title: string; url: string; snippet: string; /** readable page text from the crawler */ text?: string; published?: string; updated?: string; site?: string; /** set on pages followed from a result: the page that linked to it */ via?: string; }
export interface WebUpdate { site: string; title: string; url: string; date?: string; summary?: string; }
/** One site that contributed to an answer. Shown under the reply, each as a web icon with the site name. */
export interface WebSource { url: string; title: string; host: string; }
export interface WebResearch { hits: WebHit[]; updates: WebUpdate[]; sources: WebSource[]; }
export interface CrawledPage { url: string; finalUrl?: string; title: string; text: string; description?: string; published?: string; updated?: string; site?: string; depth?: 1 | 2; via?: string; }
export interface SearchVariant { q: string; /** only results from the past day, week, month or year */ fresh?: 'd' | 'w' | 'm' | 'y'; }

export const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; } };
export const normUrl = (u: string): string => {
  try { const x = new URL(u); x.hash = ''; for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) x.searchParams.delete(k); x.hostname = x.hostname.replace(/^www\./i, ''); return x.toString().replace(/\/$/, ''); } catch { return u; }
};

const RECENT = /\b(latest|news|updates?|updated|today|tonight|currently|current|now|recent(ly)?|this (week|month|year)|new|newest|releases?|released|price|prices|score|scores|weather|breaking|announce[ds]?|trending|20\d\d)\b/i;

/** Query plan for deep research: original question, targeted variants, official documentation
 * when technical, and troubleshooting evidence when the request indicates a failure. */
export function queryVariants(prompt: string): SearchVariant[] {
  const q = prompt.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!q) return [];
  const recent = RECENT.test(q);
  const technical = /\b(api|sdk|github|error|exception|build|compile|typescript|react|android|capacitor|python|framework|library|package|documentation|docs|debug|code|app|application|website|backend|frontend|deploy|terminal|npm|firebase|firestore|vercel)\b/i.test(q);
  const docsIntent = /\b(official documentation|docs|documentation|api reference|how to use|installation guide|implement|build|create|develop|configure|setup|set up|install|integrate|wire|upgrade|fix|debug|troubleshoot|deploy|production)\b/i.test(q);
  const troubleshootIntent = /\b(error|exception|failed|failure|bug|debug|fix|troubleshoot|broken|not working|doesn't work|cannot|can't)\b/i.test(q);
  const variants: SearchVariant[] = [{ q, ...(recent ? { fresh: 'm' as const } : {}) }];
  if (recent) variants.push({ q, fresh: 'y' });
  if (technical && docsIntent) variants.push({ q: `${q} official documentation current API`.slice(0, 200) });
  if (technical && troubleshootIntent) variants.push({ q: `${q} error solution issue tracker troubleshooting`.slice(0, 200) });
  if (technical && !troubleshootIntent) variants.push({ q: `${q} best practices implementation examples`.slice(0, 200) });
  return variants.slice(0, 5);
}

/** Interleaves several result lists, drops repeated pages, and keeps at most `perHost` per site. */
/** Interleaves several result lists (so the best of each comes first), drops repeated pages, and keeps at most `perHost` per site. */
export function mergeHits(lists: WebHit[][], max = 10, perHost = 2): WebHit[] {
  const out: WebHit[] = []; const seen = new Set<string>(); const count = new Map<string, number>();
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const h = l[i]; if (!h || !h.url || out.length >= max) continue;
      const k = normUrl(h.url); const host = hostOf(h.url);
      if (seen.has(k) || (count.get(host) ?? 0) >= perHost) continue;
      seen.add(k); count.set(host, (count.get(host) ?? 0) + 1); out.push(h);
    }
  }
  return out;
}

/** Ranks hits by query-term overlap and suppresses clearly unrelated results. */
export function rankHits(query: string, hits: WebHit[], max = 10): WebHit[] {
  const stop = new Set(['what','who','when','where','why','how','the','a','an','is','are','was','were','to','of','in','on','for','with','and','or','about','best','latest','current','today','please','tell','me']);
  const terms = query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(t => t.length > 2 && !stop.has(t));
  if (!terms.length) return hits.slice(0, max);
  const scored = hits.map((h, i) => {
    const title = (h.title || '').toLowerCase(); const snippet = (h.snippet || '').toLowerCase(); const content = (h.text || '').toLowerCase(); const url = h.url.toLowerCase();
    const matched = terms.filter(t => title.includes(t) || snippet.includes(t) || content.includes(t) || url.includes(t));
    const score = matched.reduce((sum, t) => sum + (title.includes(t) ? 3 : 0) + (snippet.includes(t) ? 1 : 0) + (content.includes(t) ? .5 : 0) + (url.includes(t) ? .5 : 0), 0) + (title.toLowerCase().includes(query.toLowerCase()) ? 4 : 0);
    return { h, i, score, matched: matched.length };
  }).filter(x => x.score > 0 && x.matched > 0).sort((a,b) => b.score-a.score || a.i-b.i);
  return scored.slice(0, max).map(x => x.h);
}

/** Puts the crawler's page text onto the matching results, and adds the pages it followed from them as extra entries. */
export function applyCrawl(hits: WebHit[], pages: CrawledPage[]): WebHit[] {
  const by = new Map<string, CrawledPage>();
  for (const p of pages.filter((x) => x.depth !== 2)) { by.set(normUrl(p.url), p); if (p.finalUrl) by.set(normUrl(p.finalUrl), p); }
  const used = new Set<CrawledPage>();
  const merged = hits.map((h) => {
    const p = by.get(normUrl(h.url)); if (!p) return h; used.add(p);
    return { ...h, text: p.text, published: p.published, updated: p.updated, site: p.site ?? hostOf(h.url), snippet: h.snippet || p.description || '' };
  });
  const known = new Set(hits.map((h) => normUrl(h.url)));
  const deep: WebHit[] = [];
  for (const p of pages.filter((x) => x.depth === 2)) {
    const url = p.finalUrl || p.url; if (known.has(normUrl(url))) continue; known.add(normUrl(url));
    deep.push({ title: p.title, url, snippet: p.description ?? '', text: p.text, published: p.published, updated: p.updated, site: p.site ?? hostOf(url), via: p.via });
  }
  return [...merged, ...deep];
}

/** Page-level sources, deduplicated by normalized URL and kept in research rank order. */
export function buildSources(hits: WebHit[], max = 8): WebSource[] {
  const out: WebSource[] = []; const seen = new Set<string>();
  for (const h of hits) {
    const host = hostOf(h.url); if (!host || !/^https?:\/\//i.test(h.url)) continue;
    const normalized = h.url.replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized); out.push({ url: h.url, title: (h.title || host).slice(0, 120), host }); if (out.length >= max) break;
  }
  return out;
}

const PAGE_CAP = 6_000; const DEEP_CAP = 3_000; const TOTAL = 40_000;
/** Lays the findings out for the model: results with their page text and dates, pages followed from them, then each site's newest feed items. */
export function resultsBlock(query: string, r: { hits: WebHit[]; updates?: WebUpdate[] }, today: string): string {
  let left = TOTAL;
  const dates = (h: { published?: string; updated?: string }) => [h.published && `published ${h.published}`, h.updated && h.updated !== h.published && `updated ${h.updated}`].filter(Boolean).join(', ');
  const entry = (h: WebHit, n: number, cap: number) => {
    const body = h.text ? h.text.slice(0, Math.max(0, Math.min(cap, left))) : ''; left -= body.length;
    const d = dates(h);
    return [`${n}. ${h.title}`, `   [🌐](${h.url})${d ? ` (${d})` : ''}`, h.snippet ? `   ${h.snippet}` : '', body ? `   PAGE CONTENT:\n${body}` : ''].filter(Boolean).join('\n');
  };
  const direct = r.hits.filter((h) => !h.via); const deep = r.hits.filter((h) => h.via);
  const out = [`WEB RESULTS for "${query}" (searched ${today}):`, ...direct.map((h, i) => entry(h, i + 1, PAGE_CAP))];
  if (deep.length) out.push('', 'MORE PAGES FOLLOWED FROM THOSE SITES:', ...deep.map((h, i) => entry(h, direct.length + i + 1, DEEP_CAP)));
  if (r.updates?.length) out.push('', 'LATEST ITEMS PUBLISHED BY THOSE SITES (newest first):', ...r.updates.map((u) => `- ${u.date ? `${u.date} · ` : ''}${u.site}: ${u.title} [🌐](${u.url})${u.summary ? `\n  ${u.summary}` : ''}`));
  return out.join('\n');
}
