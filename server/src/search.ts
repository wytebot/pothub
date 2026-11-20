/** DuckDuckGo has no official web-search API, so this reads its plain HTML results page and falls back to its Instant Answer API. Used for free and Premium accounts with server-side daily limits. */
export interface Hit { title: string; url: string; snippet: string; }

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#x27': "'", '#39': "'", '#x2F': '/' };
const text = (h: string) => h.replace(/<[^>]*>/g, '').replace(/&(#?\w+);/g, (m, e: string) => entities[e] ?? (/^#\d+$/.test(e) ? String.fromCharCode(Number(e.slice(1))) : m)).replace(/\s+/g, ' ').trim();

/** Result links go through duckduckgo.com/l/?uddg=<real address>. Returns the real address, or null for ads and anything that is not http(s). */
export function unwrap(href: string): string | null {
  try {
    const u = new URL(href.replace(/&amp;/g, '&').startsWith('//') ? `https:${href.replace(/&amp;/g, '&')}` : href.replace(/&amp;/g, '&'));
    if (u.hostname.endsWith('duckduckgo.com')) { if (u.pathname === '/y.js') return null; const t = u.searchParams.get('uddg'); if (!t) return null; return /^https?:\/\//i.test(t) ? t : null; }
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch { return null; }
}

export function parseDdg(html: string, max = 8): Hit[] {
  const tags = [...html.matchAll(/<a\s[^>]*class="[^"]*result__a[^"]*"[^>]*>/g)];
  const out: Hit[] = []; const seen = new Set<string>();
  tags.forEach((m, i) => {
    const href = m[0].match(/href="([^"]+)"/)?.[1]; const url = href ? unwrap(href) : null; if (!url || seen.has(url)) return;
    const start = (m.index ?? 0) + m[0].length; const end = tags[i + 1]?.index ?? html.length; const chunk = html.slice(start, end);
    const title = text(chunk.slice(0, chunk.indexOf('</a>') < 0 ? 200 : chunk.indexOf('</a>')));
    const snippet = text(chunk.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/)?.[1] ?? '');
    if (!title) return;
    seen.add(url); out.push({ title: title.slice(0, 160), url, snippet: snippet.slice(0, 400) });
  });
  return out.slice(0, max);
}

const cache = new Map<string, { at: number; hits: Hit[] }>();
/** Optional recency filter: past day, week, month or year. */
export type Fresh = 'd' | 'w' | 'm' | 'y';
export const parseFresh = (v: string | null | undefined): Fresh | undefined => (v === 'd' || v === 'w' || v === 'm' || v === 'y' ? v : undefined);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function ddgSearch(query: string, max = 6, fresh?: Fresh): Promise<Hit[]> {
  const key = `${fresh ?? ''}|${query.toLowerCase()}`; const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.hits.slice(0, max);
  if (cache.size > 300) cache.clear();
  let hits: Hit[] = [];
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}${fresh ? `&df=${fresh}` : ''}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' }, signal: AbortSignal.timeout(9_000) });
    if (r.ok) hits = parseDdg(await r.text());
  } catch { /* try the fallback below */ }
  if (!hits.length) {
    const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(9_000) });
    if (!r.ok) throw new Error('search unavailable');
    const j = await r.json() as { AbstractText?: string; AbstractURL?: string; Heading?: string; RelatedTopics?: { Text?: string; FirstURL?: string }[] };
    if (j.AbstractText && j.AbstractURL) hits.push({ title: j.Heading || query, url: j.AbstractURL, snippet: j.AbstractText.slice(0, 400) });
    for (const t of j.RelatedTopics ?? []) if (t.Text && t.FirstURL && hits.length < 8) hits.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text.slice(0, 300) });
  }
  cache.set(key, { at: Date.now(), hits });
  return hits.slice(0, max);
}

