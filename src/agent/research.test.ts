import { describe, expect, it } from 'vitest';
import { applyCrawl, buildSources, hostOf, mergeHits, normUrl, queryVariants, rankHits, resultsBlock, type WebHit } from './research';

const hit = (url: string, title = url, snippet = 'snippet'): WebHit => ({ title, url, snippet });

describe('search variants', () => {
  it('adds a past-month search, first, when the question is about something recent', () => {
    expect(queryVariants('What is the latest Android version?').slice(0, 2)).toEqual([{ q: 'What is the latest Android version?', fresh: 'm' }, { q: 'What is the latest Android version?' }]);
    expect(queryVariants('What is the latest Android version?')).toHaveLength(2);
    expect(queryVariants('Nigeria news this week').length).toBe(2);
  });
  it('runs one plain search for a timeless question', () => {
    expect(queryVariants('Explain   photosynthesis')).toEqual([{ q: 'Explain photosynthesis' }]);
  });
  it('does not add generic docs or troubleshooting searches unless intent is explicit', () => {
    expect(queryVariants('React component architecture')).toEqual([{ q: 'React component architecture' }]);
    expect(queryVariants('React documentation')).toHaveLength(2);
    expect(queryVariants('Fix TypeScript build error')).toHaveLength(2);
  });
});

describe('merging results', () => {
  it('interleaves lists, drops repeats (tracking tags, www, trailing slash) and caps each site', () => {
    const fresh = [hit('https://a.com/1'), hit('https://a.com/2'), hit('https://a.com/3'), hit('https://b.com/x?utm_source=z')];
    const plain = [hit('https://www.b.com/x/'), hit('https://c.com/y'), hit('https://a.com/1#top')];
    const out = mergeHits([fresh, plain], 10, 2).map((h) => h.url);
    expect(out).toEqual(['https://a.com/1', 'https://www.b.com/x/', 'https://a.com/2', 'https://c.com/y']);
  });
  it('stops at the maximum', () => {
    const many = Array.from({ length: 30 }, (_, i) => hit(`https://s${i}.com/`));
    expect(mergeHits([many], 10).length).toBe(10);
  });
  it('helpers normalise addresses', () => {
    expect(hostOf('https://www.Example.com/a')).toBe('example.com');
    expect(normUrl('https://www.example.com/a/?utm_medium=x&id=2#frag')).toBe('https://example.com/a/?id=2');
  });
});

describe('result relevance ranking', () => {
  it('prioritizes relevant titles and drops unrelated results', () => {
    const out = rankHits('React hooks useEffect', [hit('https://x.com/1', 'React useEffect guide', 'Hooks explanation'), hit('https://y.com/2', 'Best pizza places', 'Food list'), hit('https://z.com/3', 'React hooks tutorial', 'useEffect basics')]);
    expect(out.map(x => x.title)).toEqual(['React useEffect guide', 'React hooks tutorial']);
  });
  it('keeps publisher pages relevant by matching query terms in extracted article text', () => {
    const out = rankHits('publisher SEO backlink quality', [{ ...hit('https://publisher.example/article', 'Article', 'General overview'), text: 'This article discusses SEO backlink quality and link relevance.' }]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain('SEO backlink quality');
  });
});

describe('crawl results', () => {
  const hits = [hit('http://acme.com/', 'Acme', 'about acme'), hit('https://news.org/s', 'News')];
  it('puts page text and dates on the matching result, including after a redirect, and adds followed pages', () => {
    const out = applyCrawl(hits, [
      { url: 'http://acme.com/', finalUrl: 'https://www.acme.com/', title: 'Acme home', text: 'Acme page text', published: '2026-11-18', updated: '2026-11-19', depth: 1 },
      { url: 'https://www.acme.com/blog/x', finalUrl: 'https://www.acme.com/blog/x', title: 'Release notes', text: 'Notes', description: 'Notes desc', depth: 2, via: 'https://www.acme.com/' },
      { url: 'https://news.org/s', title: 'dup deep', text: 'T', depth: 2, via: 'https://x.com' },
    ]);
    expect(out[0].text).toBe('Acme page text'); expect(out[0].published).toBe('2026-11-18'); expect(out[0].snippet).toBe('about acme');
    expect(out[1].text).toBeUndefined();
    expect(out.length).toBe(3);
    expect(out[2]).toEqual({ title: 'Release notes', url: 'https://www.acme.com/blog/x', snippet: 'Notes desc', text: 'Notes', published: undefined, updated: undefined, site: 'acme.com', via: 'https://www.acme.com/' });
  });
});

describe('source sites shown under an answer', () => {
  it('lists each site once, in rank order, with the www removed', () => {
    const s = buildSources([hit('https://www.bbc.com/a', 'BBC A'), hit('https://bbc.com/b', 'BBC B'), hit('https://reuters.com/c', 'Reuters'), hit('ftp://x.org/d', 'ftp'), hit('https://acme.com/e', '')]);
    expect(s.map((x) => x.host)).toEqual(['bbc.com', 'reuters.com', 'acme.com']);
    expect(s[0]).toEqual({ url: 'https://www.bbc.com/a', title: 'BBC A', host: 'bbc.com' });
    expect(s[2].title).toBe('acme.com');
  });
  it('is empty when there are no results, so nothing is shown', () => {
    expect(buildSources([])).toEqual([]);
  });
  it('caps the list', () => {
    expect(buildSources(Array.from({ length: 20 }, (_, i) => hit(`https://s${i}.com/`))).length).toBe(8);
  });
});

describe('what the model is given', () => {
  it('shows results with dates and page text, followed pages, and the newest feed items', () => {
    const text = resultsBlock('acme', {
      hits: [{ ...hit('https://acme.com/', 'Acme'), text: 'PAGE', published: '2026-11-18', updated: '2026-11-19' }, { ...hit('https://acme.com/b', 'Notes'), text: 'DEEP', via: 'https://acme.com/' }],
      updates: [{ site: 'acme.com', title: 'Acme 4.3 beta', url: 'https://acme.com/43', date: '2026-11-19', summary: 'Beta out' }],
    }, '20 November 2026');
    expect(text).toContain('WEB RESULTS for "acme" (searched 20 November 2026):');
    expect(text).toContain('[🌐](https://acme.com/) (published 2026-11-18, updated 2026-11-19)');
    expect(text).toContain('MORE PAGES FOLLOWED FROM THOSE SITES:');
    expect(text).toContain('LATEST ITEMS PUBLISHED BY THOSE SITES (newest first):');
    expect(text).toContain('- 2026-11-19 · acme.com: Acme 4.3 beta [🌐](https://acme.com/43)');
  });
  it('omits the extra sections when there is nothing for them', () => {
    const text = resultsBlock('q', { hits: [hit('https://a.com/')] }, 'today');
    expect(text).not.toContain('MORE PAGES'); expect(text).not.toContain('LATEST ITEMS');
  });
  it('keeps the whole block within a fixed budget however much was crawled', () => {
    const hits = Array.from({ length: 12 }, (_, i) => ({ ...hit(`https://s${i}.com/`, `S${i}`), text: 'x'.repeat(12_000), via: i > 4 ? 'https://s0.com/' : undefined }));
    const text = resultsBlock('q', { hits }, 'today');
    expect(text.length).toBeLessThan(40_000 + 4_000);
  });
});
