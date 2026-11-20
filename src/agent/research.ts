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

/** The searches to run for a question: always the question itself, plus a past-month search when it is about something recent. */
export function queryVariants(prompt: string): SearchVariant[] {
  const q = prompt.replace(/\s+/g, ' ').trim().slice(0, 200);
  return RECENT.test(q) ? [{ q, fresh: 'm' }, { q }] : [{ q }];
}

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

/** One entry per site, in rank order, for everything the model was given. */
export function buildSources(hits: WebHit[], max = 8): WebSource[] {
  const out: WebSource[] = []; const seen = new Set<string>();
  for (const h of hits) {
    const host = hostOf(h.url); if (!host || seen.has(host) || !/^https?:\/\//i.test(h.url)) continue;
    seen.add(host); out.push({ url: h.url, title: (h.title || host).slice(0, 120), host }); if (out.length >= max) break;
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
