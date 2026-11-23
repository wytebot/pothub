import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Bounded research crawler used by /api/crawl.
 *  - fetches the top result pages IN PARALLEL (the old crawler went one page at a time)
 *  - follows redirects itself, re-checking every hop (the old one skipped any redirecting site)
 *  - reads the main article text plus publish/update dates instead of stripping every <header>/<nav>
 *  - goes one level deeper: a few same-site links that look relevant to the question (news, updates, releases...)
 *  - reads each site's RSS/Atom feed, when it advertises one, for its newest items
 * Everything shares one time budget, so a slow site can never hold the answer up for long.
 */

export interface CrawledPage { url: string; finalUrl: string; title: string; text: string; description?: string; published?: string; updated?: string; site: string; depth: 1 | 2; via?: string; }
export interface FeedItem { site: string; title: string; url: string; date?: string; summary?: string; }
export interface Link { url: string; text: string; }
export interface CrawlOptions { query?: string; depth?: 1 | 2; maxPages?: number; budgetMs?: number; fetch?: typeof fetch; resolve?: (host: string) => Promise<string[]>; now?: () => number; }

// ---------------------------------------------------------------- safety: never fetch anything on a private network
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2002:')) return true;
    const mapped = /^::ffff:(.+)$/.exec(s);
    if (mapped) {
      const t = mapped[1];
      if (t.includes('.')) return isPrivateAddress(t);
      const h = t.split(':').map((x) => parseInt(x, 16)); if (h.length === 2 && h.every(Number.isFinite)) return isPrivateAddress(`${h[0] >> 8}.${h[0] & 255}.${h[1] >> 8}.${h[1] & 255}`);
      return true;
    }
    return false;
  }
  return true; // not an address at all: refuse
}

const lookupAll = async (host: string): Promise<string[]> => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** The URL if it is safe to fetch (public http/https, standard port, no credentials, resolves to public addresses only), else null. */
export async function safeUrl(raw: string, resolve: (host: string) => Promise<string[]> = lookupAll): Promise<URL | null> {
  let u: URL; try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(local|localhost|internal|lan|home|corp)$/.test(host)) return null;
  try { const addrs = isIP(host) ? [host] : await resolve(host); if (!addrs.length || addrs.some(isPrivateAddress)) return null; } catch { return null; }
  u.hash = ''; return u;
}

// ---------------------------------------------------------------- fetching with a size cap and a shared deadline
async function readCapped(r: Response, max: number): Promise<string> {
  const label = /charset=([\w-]+)/i.exec(r.headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
  let dec: TextDecoder; try { dec = new TextDecoder(label); } catch { dec = new TextDecoder('utf-8'); }
  if (!r.body) return dec.decode(new TextEncoder().encode((await r.text()).slice(0, max)));
  const reader = r.body.getReader(); const parts: Uint8Array[] = []; let n = 0;
  try { for (; n < max;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.length; } } catch { /* keep what arrived */ }
  try { await reader.cancel(); } catch { /* already closed */ }
  const all = new Uint8Array(Math.min(n, max)); let at = 0; for (const p of parts) { const room = all.length - at; if (room <= 0) break; all.set(p.subarray(0, room), at); at += Math.min(p.length, room); }
  return dec.decode(all);
}

interface Ctx { fetch: typeof fetch; resolve: (h: string) => Promise<string[]>; deadline: number; now: () => number; }
async function fetchLimited(raw: string, c: Ctx, o: { accept: string; types: RegExp; maxBytes: number }): Promise<{ url: string; body: string } | null> {
  let url = await safeUrl(raw, c.resolve);
  for (let hop = 0; url && hop <= 4; hop++) {
    const left = c.deadline - c.now(); if (left < 400) return null;
    let r: Response;
    try { r = await c.fetch(url.toString(), { headers: { 'User-Agent': 'PothubResearch/1.1 (+https://pothub.app)', Accept: o.accept, 'Accept-Language': 'en' }, redirect: 'manual', signal: AbortSignal.timeout(Math.min(7_000, left)) }); } catch { return null; }
    if (r.status >= 300 && r.status < 400) { const loc = r.headers.get('location'); if (!loc) return null; try { url = await safeUrl(new URL(loc, url).toString(), c.resolve); } catch { return null; } continue; }
    if (!r.ok || !o.types.test(r.headers.get('content-type') ?? '')) return null;
    return { url: url.toString(), body: await readCapped(r, o.maxBytes) };
  }
  return null;
}

// ---------------------------------------------------------------- reading a page
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©' };
export const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isInteger(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return NAMED[e.toLowerCase()] ?? m;
});
const strip = (s: string) => decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attrOf = (tag: string, name: string) => { const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag); const v = m ? (m[1] ?? m[2]) : undefined; return v === undefined ? undefined : decode(v); };
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const sameSite = (a: string, b: string) => !!hostOf(a) && hostOf(a) === hostOf(b);
export const normUrl = (u: string) => { try { const x = new URL(u); x.hash = ''; for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) x.searchParams.delete(k); x.hostname = x.hostname.replace(/^www\./, ''); return x.toString().replace(/\/$/, ''); } catch { return u; } };
const day = (s?: string) => { const t = s?.trim(); if (!t) return undefined; if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); const d = new Date(t); return Number.isNaN(d.getTime()) ? t.slice(0, 30) : d.toISOString().slice(0, 10); };

function bodyText(fragment: string, dropHeader: boolean): string {
  const gone = dropHeader ? 'script|style|noscript|svg|nav|footer|aside|form|iframe|template|button|select|header' : 'script|style|noscript|svg|nav|footer|aside|form|iframe|template|button|select';
  const t = fragment.replace(new RegExp(`<(${gone})\\b[\\s\\S]*?</\\1>`, 'gi'), ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<h([1-3])\b[^>]*>/gi, '\n\n## ').replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|section|article|h[1-6]|tr|ul|ol|table|blockquote|header|main)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const out: string[] = [];
  for (const l of decode(t).split('\n')) { const x = l.replace(/[ \t\u00a0]+/g, ' ').trim(); if (x.length >= 3 && x !== out[out.length - 1]) out.push(x); }
  return out.join('\n');
}

export function extractPage(html: string, base: string, maxChars = 12_000): { title: string; description?: string; published?: string; updated?: string; text: string; links: Link[]; feeds: string[] } {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (...keys: string[]) => { for (const t of tags) { const k = (attrOf(t, 'property') ?? attrOf(t, 'name') ?? attrOf(t, 'itemprop') ?? '').toLowerCase(); if (keys.includes(k)) { const c = attrOf(t, 'content')?.trim(); if (c) return c; } } return undefined; };
  const title = (meta('og:title', 'twitter:title') ?? strip(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')) || hostOf(base);
  const description = meta('description', 'og:description', 'twitter:description');
  const published = day(meta('article:published_time', 'datepublished', 'og:published_time', 'date') ?? /"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? /<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i.exec(html)?.[1]);
  const updated = day(meta('article:modified_time', 'og:updated_time', 'datemodified') ?? /"dateModified"\s*:\s*"([^"]+)"/.exec(html)?.[1]);

  // Main content: <main>, else the longest <article>, else the whole body.
  const main = /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0];
  const articles = [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((m) => m[0]).sort((a, b) => b.length - a.length);
  let text = ''; for (const c of [main, articles[0]]) { if (!c) continue; const t = bodyText(c, false); if (t.length >= 400) { text = t; break; } }
  if (!text) text = bodyText(html.replace(/^[\s\S]*?<body\b[^>]*>/i, ''), true);
  if (text.length > maxChars) text = `${text.slice(0, maxChars).replace(/\s+\S*$/, '')}…`;

  const links: Link[] = []; const seen = new Set<string>([normUrl(base)]);
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attrOf(m[1], 'href'); if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let u: URL; try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || !sameSite(u.toString(), base) || /\.(pdf|zip|png|jpe?g|gif|webp|svg|mp[34]|css|js|xml|json|ico|docx?|xlsx?|pptx?)$/i.test(u.pathname)) continue;
    const key = normUrl(u.toString()); if (seen.has(key)) continue; seen.add(key);
    links.push({ url: (u.hash = '', u.toString()), text: strip(m[2]).slice(0, 120) }); if (links.length >= 80) break;
  }
  const feeds: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/alternate/i.test(attrOf(m[0], 'rel') ?? '') && /(rss|atom)\+xml/i.test(attrOf(m[0], 'type') ?? '')) { const h = attrOf(m[0], 'href'); if (h) { try { feeds.push(new URL(h, base).toString()); } catch { /* bad href */ } } }
  }
  return { title: title.slice(0, 180), description: description?.slice(0, 300), published, updated, text, links, feeds: feeds.slice(0, 2) };
}

// ---------------------------------------------------------------- going deeper: which same-site links are worth following
const STOP = new Set(['the', 'and', 'for', 'with', 'what', 'how', 'who', 'when', 'where', 'why', 'are', 'was', 'this', 'that', 'from', 'about', 'into', 'you', 'your', 'can', 'will', 'has', 'have', 'not', 'does', 'did', 'best', 'give', 'tell', 'please', 'explain', 'write', 'make', 'show', 'latest', 'news', 'update', 'updates', 'new', 'current', 'today']);
export const queryTerms = (q: string): string[] => [...new Set(q.toLowerCase().match(/[a-z0-9\u00c0-\uffff]{3,}/g) ?? [])].filter((t) => !STOP.has(t)).slice(0, 12);
const FRESH = /(^|[/_\s-])(news|blog|updates?|releases?|released|changelog|announce\w*|press|latest|whats-new|stories|articles?|insights|20\d\d)([/_.\s-]|$)/i;
const JUNK = /(login|log-in|signin|sign-in|signup|register|cart|checkout|account|privacy|terms|cookie|contact|careers|jobs|subscribe|search|\/tag\/|\/category\/|page\/\d|\/feed|wp-json|share)/i;
const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export function scoreLink(l: Link, terms: string[]): number {
  let u: URL; try { u = new URL(l.url); } catch { return -10; }
  const path = safeDecode(u.pathname).toLowerCase(); const text = l.text.toLowerCase(); let s = 0;
  for (const t of terms) { if (text.includes(t)) s += 2; if (path.includes(t)) s += 1; }
  if (FRESH.test(path) || FRESH.test(text)) s += 1;
  if (JUNK.test(path)) s -= 3;
  if (path === '/' || path === '') s -= 3;
  if (l.text.length < 4) s -= 1;
  return s;
}
export function pickDeepLinks(links: Link[], terms: string[], seen: Set<string>, n: number): Link[] {
  return links.map((l, i) => ({ l, i, s: scoreLink(l, terms) })).filter((x) => x.s > 0 && !seen.has(normUrl(x.l.url))).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, n).map((x) => x.l);
}

// ---------------------------------------------------------------- feeds: the newest items a site has published
export function parseFeed(xml: string, feedUrl: string, max = 5): FeedItem[] {
  const site = hostOf(feedUrl); const out: FeedItem[] = [];
  const tag = (s: string, n: string) => new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, 'i').exec(s)?.[1];
  for (const m of [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].slice(0, max)) {
    const it = m[0]; const title = strip(tag(it, 'title') ?? ''); if (!title) continue;
    const href = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i.exec(it)?.[1] ?? strip(tag(it, 'link') ?? '');
    let url = ''; try { url = new URL(decode(href), feedUrl).toString(); } catch { continue; }
    out.push({ site, title: title.slice(0, 160), url, date: day(strip(tag(it, 'pubDate') ?? tag(it, 'published') ?? tag(it, 'updated') ?? tag(it, 'dc:date') ?? '')), summary: strip(decode(tag(it, 'description') ?? tag(it, 'summary') ?? tag(it, 'content:encoded') ?? '')).slice(0, 240) || undefined });
  }
  return out;
}

// ---------------------------------------------------------------- the crawl
export async function crawlSites(urls: string[], o: CrawlOptions = {}): Promise<{ pages: CrawledPage[]; updates: FeedItem[] }> {
  const now = o.now ?? Date.now; const c: Ctx = { fetch: o.fetch ?? fetch, resolve: o.resolve ?? lookupAll, deadline: now() + (o.budgetMs ?? 14_000), now };
  const cap = Math.max(1, Math.min(12, o.maxPages ?? 11)); const terms = queryTerms(o.query ?? '');
  const get = async (raw: string, depth: 1 | 2, via?: string) => {
    const r = await fetchLimited(raw, c, { accept: 'text/html,application/xhtml+xml', types: /text\/html|application\/xhtml/i, maxBytes: depth === 1 ? 500_000 : 300_000 });
    if (!r) return null;
    const x = extractPage(r.body, r.url, depth === 1 ? 12_000 : 6_000); if (x.text.length < 200) return null;
    const page: CrawledPage = { url: raw, finalUrl: r.url, title: x.title, text: x.text, description: x.description, published: x.published, updated: x.updated, site: hostOf(r.url), depth, via };
    return { page, links: x.links, feeds: x.feeds };
  };
  type Got = NonNullable<Awaited<ReturnType<typeof get>>>;
  const level1 = (await Promise.all([...new Set(urls)].slice(0, Math.min(6, cap)).map((u) => get(u, 1)))).filter((x): x is Got => !!x);
  const pages = level1.map((x) => x.page); const seen = new Set(level1.flatMap((x) => [normUrl(x.page.url), normUrl(x.page.finalUrl)]));
  const deepJobs: Promise<Got | null>[] = []; const feedJobs: Promise<FeedItem[]>[] = [];
  if ((o.depth ?? 2) >= 2) {
    let room = Math.max(0, cap - pages.length);
    for (const x of level1.slice(0, 3)) for (const l of pickDeepLinks(x.links, terms, seen, 2)) { if (room-- <= 0) break; seen.add(normUrl(l.url)); deepJobs.push(get(l.url, 2, x.page.finalUrl)); }
    for (const x of level1.slice(0, 3)) {
      const f = x.feeds[0]; if (!f || !sameSite(f, x.page.finalUrl)) continue;
      feedJobs.push(fetchLimited(f, c, { accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml', types: /xml|rss|atom/i, maxBytes: 300_000 }).then((r) => (r ? parseFeed(r.body, r.url, 4) : [])).catch(() => []));
    }
  }
  const [deep, feeds] = await Promise.all([Promise.all(deepJobs), Promise.all(feedJobs)]);
  for (const d of deep) if (d) pages.push(d.page);
  const updates: FeedItem[] = []; const have = new Set<string>();
  for (const it of feeds.flat().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))) { const k = normUrl(it.url); if (!have.has(k)) { have.add(k); updates.push(it); } }
  return { pages, updates: updates.slice(0, 8) };
}

/** Kept for older callers: the pages only, one level, no feeds. */
export const crawlPages = async (urls: string[], maxPages = 5) => (await crawlSites(urls, { depth: 1, maxPages })).pages;
