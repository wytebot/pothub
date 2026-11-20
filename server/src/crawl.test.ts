import test from 'node:test';
import assert from 'node:assert/strict';
import { crawlSites, extractPage, isPrivateAddress, parseFeed, pickDeepLinks, queryTerms, safeUrl, scoreLink } from './crawl.ts';

const pub = async () => ['93.184.216.34'];

test('private and special addresses are refused, public ones are not', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.5', '169.254.169.254', '172.16.0.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:7f00:1', '::ffff:127.0.0.1', 'not-an-ip']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('safeUrl allows public pages and blocks everything that could reach inside a network', async () => {
  assert.equal((await safeUrl('https://example.com/a#x', pub))?.toString(), 'https://example.com/a');
  for (const bad of ['http://localhost/', 'http://127.0.0.1/', 'http://2130706433/', 'http://[::1]/', 'ftp://example.com/', 'https://user:pw@example.com/', 'https://example.com:8080/', 'http://printer.local/', 'file:///etc/passwd', 'nonsense']) assert.equal(await safeUrl(bad, pub), null, bad);
  assert.equal(await safeUrl('https://sneaky.example.com/', async () => ['93.184.216.34', '10.0.0.5']), null, 'one private answer is enough to refuse');
  assert.equal(await safeUrl('https://gone.example.com/', async () => { throw new Error('nxdomain'); }), null);
});

const PAGE = `<html><head><title>Fallback title</title>
<meta property="og:title" content="Acme 4.2 released &amp; what changed">
<meta name="description" content="Release notes for Acme 4.2.">
<meta property="article:published_time" content="2026-11-18T09:30:00Z">
<script type="application/ld+json">{"dateModified":"2026-11-19T10:00:00Z"}</script>
<link rel="alternate" type="application/rss+xml" href="/feed.xml"></head>
<body><header><a href="/">Home</a> SITE HEADER JUNK</header><nav>NAV JUNK <a href="/pricing">Pricing</a></nav>
<main><h1>Acme 4.2</h1><p>${'Acme 4.2 adds faster exports and a new dashboard. '.repeat(12)}</p><ul><li>Faster sync</li><li>New API</li></ul>
<a href="/blog/acme-4-2-release-notes">Acme 4.2 release notes</a><a href="/login">Log in</a><a href="https://other.com/x">Elsewhere</a><a href="/files/a.pdf">PDF</a><a href="#top">top</a><a href="/news/acme-updates">Acme news and updates</a></main>
<footer>FOOTER JUNK</footer></body></html>`;

test('extractPage keeps the main content and dates, drops page furniture, and finds links and feeds', () => {
  const x = extractPage(PAGE, 'https://www.acme.com/products/acme');
  assert.equal(x.title, 'Acme 4.2 released & what changed');
  assert.equal(x.description, 'Release notes for Acme 4.2.');
  assert.equal(x.published, '2026-11-18'); assert.equal(x.updated, '2026-11-19');
  assert.match(x.text, /## Acme 4\.2/); assert.match(x.text, /- Faster sync/);
  assert.doesNotMatch(x.text, /JUNK/);
  // links come from the whole page (a "News" or "Blog" link often lives in the menu); other sites, files and anchors are left out
  assert.deepEqual(x.links.map((l) => l.url), ['https://www.acme.com/', 'https://www.acme.com/pricing', 'https://www.acme.com/blog/acme-4-2-release-notes', 'https://www.acme.com/login', 'https://www.acme.com/news/acme-updates']);
  assert.deepEqual(x.feeds, ['https://www.acme.com/feed.xml']);
});

test('extractPage falls back to the body and caps the length', () => {
  const x = extractPage(`<html><body><header>MENU</header><div>${'word '.repeat(5000)}</div></body></html>`, 'https://a.com/', 1000);
  assert.ok(x.text.length <= 1001 && x.text.endsWith('…')); assert.doesNotMatch(x.text, /MENU/);
});

test('link scoring prefers pages that match the question and look like updates', () => {
  const terms = queryTerms('What is new in Acme 4.2 release?');
  assert.deepEqual(terms, ['acme', 'release']);
  const links = [{ url: 'https://acme.com/login', text: 'Log in' }, { url: 'https://acme.com/', text: 'Home' }, { url: 'https://acme.com/blog/acme-4-2-release-notes', text: 'Acme 4.2 release notes' }, { url: 'https://acme.com/about', text: 'About us' }, { url: 'https://acme.com/news/2026/roundup', text: 'Monthly roundup' }];
  assert.ok(scoreLink(links[2], terms) > scoreLink(links[4], terms));
  const picked = pickDeepLinks(links, terms, new Set(), 2);
  assert.deepEqual(picked.map((l) => l.url), ['https://acme.com/blog/acme-4-2-release-notes', 'https://acme.com/news/2026/roundup']);
  assert.deepEqual(pickDeepLinks(links, terms, new Set(['https://acme.com/blog/acme-4-2-release-notes']), 5).map((l) => l.url), ['https://acme.com/news/2026/roundup']);
});

test('parseFeed reads RSS and Atom', () => {
  const rss = `<rss><channel><item><title><![CDATA[Big &amp; new]]></title><link>/p/1</link><pubDate>Wed, 18 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Hello&lt;/p&gt;</description></item><item><title>Second</title><link>https://acme.com/p/2</link></item></channel></rss>`;
  const r = parseFeed(rss, 'https://www.acme.com/feed.xml');
  assert.deepEqual(r[0], { site: 'acme.com', title: 'Big & new', url: 'https://www.acme.com/p/1', date: '2026-11-18', summary: 'Hello' });
  assert.equal(r[1].url, 'https://acme.com/p/2');
  const atom = `<feed><entry><title>Atom one</title><link rel="alternate" href="https://x.org/a"/><updated>2026-11-01T00:00:00Z</updated><summary>S</summary></entry></feed>`;
  assert.deepEqual(parseFeed(atom, 'https://x.org/atom')[0], { site: 'x.org', title: 'Atom one', url: 'https://x.org/a', date: '2026-11-01', summary: 'S' });
});

// ---- the crawl itself, against a fake web
function web(routes: Record<string, { status?: number; type?: string; body?: string; location?: string; delay?: number }>) {
  let live = 0; let peak = 0; const asked: string[] = [];
  const fetchFn = (async (url: string) => {
    asked.push(url); live++; peak = Math.max(peak, live);
    const r = routes[url]; await new Promise((res) => setTimeout(res, r?.delay ?? 5)); live--;
    if (!r) return new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } });
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'text/html; charset=utf-8', ...(r.location ? { location: r.location } : {}) } });
  }) as unknown as typeof fetch;
  return { fetchFn, asked, peak: () => peak };
}
const article = (title: string, extra = '') => `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${`${title} details and background information. `.repeat(15)}</p>${extra}</main></body></html>`;

test('crawlSites reads pages in parallel, follows redirects, goes one level deeper and reads the feed', async () => {
  const home = article('Acme home', '<a href="/blog/acme-release-notes">Acme release notes</a><a href="/login">Log in</a>').replace('</head>', '<link rel="alternate" type="application/atom+xml" href="/atom.xml"></head>');
  const w = web({
    'http://acme.com/': { status: 301, location: 'https://www.acme.com/' },
    'https://www.acme.com/': { body: home, delay: 20 },
    'https://www.acme.com/blog/acme-release-notes': { body: article('Acme release notes') },
    'https://www.acme.com/atom.xml': { type: 'application/atom+xml', body: '<feed><entry><title>Acme 4.3 beta</title><link href="https://www.acme.com/blog/43"/><updated>2026-11-19T00:00:00Z</updated></entry></feed>' },
    'https://news.org/story': { body: article('A news story'), delay: 20 },
    'https://files.org/doc': { type: 'application/pdf', body: '%PDF' },
  });
  const r = await crawlSites(['http://acme.com/', 'https://news.org/story', 'https://files.org/doc'], { query: 'Acme release notes', fetch: w.fetchFn, resolve: pub });
  assert.deepEqual(r.pages.map((p) => [p.url, p.depth]), [['http://acme.com/', 1], ['https://news.org/story', 1], ['https://www.acme.com/blog/acme-release-notes', 2]]);
  assert.equal(r.pages[0].finalUrl, 'https://www.acme.com/'); assert.equal(r.pages[2].via, 'https://www.acme.com/');
  assert.equal(r.updates.length, 1); assert.equal(r.updates[0].title, 'Acme 4.3 beta');
  assert.ok(w.peak() >= 2, 'top pages are fetched at the same time');
  assert.ok(!w.asked.includes('https://www.acme.com/login'), 'junk links are not followed');
});

test('crawlSites never follows a redirect to a private address, and never fetches one directly', async () => {
  const w = web({ 'https://evil.com/': { status: 302, location: 'http://169.254.169.254/latest/meta-data' }, 'https://ok.com/': { body: article('Fine') } });
  const resolve = async (h: string) => (h === 'evil.com' || h === 'ok.com' ? ['93.184.216.34'] : ['10.0.0.1']);
  const r = await crawlSites(['https://evil.com/', 'http://localhost:3000/', 'http://10.0.0.1/', 'https://ok.com/'], { fetch: w.fetchFn, resolve, depth: 1 });
  assert.deepEqual(r.pages.map((p) => p.url), ['https://ok.com/']);
  assert.ok(!w.asked.some((u) => /169\.254|localhost|10\.0\.0\.1/.test(u)));
});

test('crawlSites stops following redirect loops and respects depth 1', async () => {
  const w = web({ 'https://loop.com/': { status: 302, location: 'https://loop.com/' }, 'https://a.com/': { body: article('A', '<a href="/blog/update-news">Update news</a>') }, 'https://a.com/blog/update-news': { body: article('B') } });
  const r = await crawlSites(['https://loop.com/', 'https://a.com/'], { fetch: w.fetchFn, resolve: pub, depth: 1, query: 'update news' });
  assert.deepEqual(r.pages.map((p) => p.url), ['https://a.com/']);
  assert.ok(w.asked.filter((u) => u === 'https://loop.com/').length <= 6);
});

test('crawlSites gives up on slow pages when the shared time budget is spent', async () => {
  const w = web({ 'https://slow.com/': { body: article('Slow'), delay: 50 } });
  let t = 1_000; const r = await crawlSites(['https://slow.com/'], { fetch: w.fetchFn, resolve: pub, budgetMs: 100, now: () => (t += 80) });
  assert.deepEqual(r.pages, []);
});
