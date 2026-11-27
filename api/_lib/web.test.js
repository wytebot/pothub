import { describe, expect, it } from 'vitest';
import { checkSite, extractPage, hasVerificationTag, isPrivateAddress, safeUrl, verificationTag, verificationToken } from './web.js';

const pub = async () => ['93.184.216.34'];
const html = (tag = '') => `<!doctype html><html><head><title>Example site title here</title>${tag}</head><body><main><h1>Hello</h1><p>${'Readable words. '.repeat(60)}</p></main></body></html>`;
const fakeFetch = (body, status = 200) => async () => new Response(body, { status, headers: { 'content-type': 'text/html' } });

describe('site verification helpers', () => {
  it('makes a stable token per account and host', () => {
    const a = verificationToken('u1', 'example.com', 'k');
    expect(a).toMatch(/^pothub-/); expect(a).toBe(verificationToken('u1', 'www.Example.com', 'k'));
    expect(a).not.toBe(verificationToken('u2', 'example.com', 'k')); expect(verificationToken('u1', 'example.com', '')).toBeNull();
  });
  it('finds the tag only inside <head> and only with the right token', () => {
    const t = 'pothub-abc';
    expect(hasVerificationTag(html(verificationTag(t)), t)).toBe(true);
    expect(hasVerificationTag(`<head><META CONTENT='${t}' NAME='pothub-site-verification' /></head>`, t)).toBe(true);
    expect(hasVerificationTag(`<head></head><body>${verificationTag(t)}</body>`, t)).toBe(false);
    expect(hasVerificationTag(html(verificationTag('pothub-other')), t)).toBe(false);
  });
  it('refuses private addresses and odd URLs', async () => {
    expect(isPrivateAddress('10.0.0.1')).toBe(true); expect(isPrivateAddress('93.184.216.34')).toBe(false);
    expect(await safeUrl('http://localhost/', pub)).toBeNull(); expect(await safeUrl('ftp://example.com', pub)).toBeNull();
    expect(await safeUrl('https://example.com:8443', pub)).toBeNull(); expect((await safeUrl('https://example.com/a#x', pub))?.hash).toBe('');
  });
  it('checkSite passes with the tag, fails without it', async () => {
    const token = verificationToken('u1', 'example.com', 'k');
    const ok = await checkSite('u1', 'https://example.com/', { key: 'k', resolve: pub, fetcher: fakeFetch(html(verificationTag(token))) });
    expect(ok.ok).toBe(true);
    const no = await checkSite('u1', 'https://example.com/', { key: 'k', resolve: pub, fetcher: fakeFetch(html()) });
    expect(no).toMatchObject({ ok: false, status: 403 });
    const none = await checkSite('u1', 'https://example.com/', { key: '', resolve: pub, fetcher: fakeFetch(html()) });
    expect(none).toMatchObject({ ok: false, status: 503 });
  });
  it('extracts title, text with headings and a canonical hint', () => {
    const p = extractPage(html('<link rel="canonical" href="https://example.com/">'), 'https://example.com/');
    expect(p.title).toBe('Example site title here'); expect(p.text).toContain('## Hello'); expect(p.text).toContain('canonical url');
  });
});
