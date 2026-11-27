export type Page = { url: string; title: string; text: string };
export type Site = { id: string; url: string; label: string; verified?: boolean; crawl?: boolean };
export type Check = { name: string; ok: boolean; detail: string; recommendation: string };
export const POT_HUB_URL = 'https://pothub-self.vercel.app/';
export const safeLabel = (label: string) => label.trim().replace(/[<>"']/g, '').slice(0, 80) || 'MonyGist';
export function backlinkSnippet(site: Site) {
  const label = safeLabel(site.label);
  // Omitting rel="nofollow"/"sponsored"/"ugc" makes this a normal followed link by default.
  return `<a href="${POT_HUB_URL}" title="${label} uses MonyGist website tools">MonyGist</a>`;
}
export function analyze(page: Page): Check[] {
  const text = page.text || '';
  const words = text.match(/\b[\p{L}\p{N}]+\b/gu) || [];
  const isHttps = /^https:\/\//i.test(page.url || '');
  const title = page.title || '';
  const headings = (text.match(/\n#{1,6}\s/g) || []).length;
  const links = (text.match(/https?:\/\//g) || []).length;
  const canonicalSignal = /canonical|canonical url/i.test(text);
  const hasQuestion = /\?|how |what |why |when |where |which /i.test(text);
  return [
    { name: 'HTTPS', ok: isHttps, detail: isHttps ? 'The crawled URL is encrypted in transit.' : 'The URL does not use HTTPS.', recommendation: 'Use HTTPS for every public page and redirect HTTP to HTTPS.' },
    { name: 'Title signal', ok: title.trim().length >= 15 && title.trim().length <= 65, detail: title ? `Title length: ${title.trim().length} characters. ${title}` : 'No title was extracted.', recommendation: 'Write a unique, descriptive title that fits roughly 15–65 characters and clearly describes the page.' },
    { name: 'Content depth', ok: words.length >= 300, detail: `${words.length.toLocaleString()} words were extracted.`, recommendation: 'Add original, useful detail where it helps the reader. Do not pad pages just to reach a word count.' },
    { name: 'Readable content', ok: text.trim().length >= 500, detail: `${text.trim().length.toLocaleString()} readable characters extracted.`, recommendation: 'Make the primary content available as text and avoid hiding important information inside images or scripts.' },
    { name: 'Topic clarity', ok: hasQuestion || words.length > 120, detail: 'Heuristic signal based on page text; it does not evaluate ranking.', recommendation: 'Make the page topic, audience and purpose clear near the top. Use natural headings and answer the visitor’s likely questions.' },
    { name: 'Heading/content structure', ok: headings > 2 || /\n[A-Z][^\n]{8,80}\n/g.test(text), detail: 'Heading structure is estimated from extracted text and may miss rendered HTML headings.', recommendation: 'Organize the page with descriptive H1/H2/H3 headings in a logical order.' },
    { name: 'Link opportunities', ok: links >= 2, detail: `Found approximately ${links} URL references in extracted text.`, recommendation: 'Link to relevant supporting pages and use descriptive anchor text. Avoid unrelated or excessive links.' },
    { name: 'Canonical signal', ok: canonicalSignal, detail: canonicalSignal ? 'Canonical text signal found in crawl output.' : 'Canonical tag was not detected in extracted text; this is not a definitive tag check.', recommendation: 'Confirm the HTML contains a correct rel="canonical" tag when duplicate or alternate URLs exist.' },
  ];
}
