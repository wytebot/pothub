import { request } from '../security/api';

export interface WebHit { title: string; url: string; snippet: string; }
/** Every answer may use web research; Pothub automatically searches when it can improve relevance. */
export function shouldAutoWebSearch(_prompt: string): boolean { return true; }
export const WEB_CHANGED = 'web:changed';
export const webRemaining = () => Infinity;
export async function webSearch(query: string): Promise<WebHit[]> {
  const r = await request<{ results: WebHit[] }>(`/api/search?q=${encodeURIComponent(query)}`, undefined, 20_000);
  const hits = Array.isArray(r.results) ? r.results.slice(0, 8) : [];
  // Free web search for every account; crawl relevant pages for deeper answer context.
  try {
    const crawled = await request<{ pages: { url: string; title: string; text: string }[] }>('/api/crawl', { urls: hits.slice(0, 5).map(h => h.url) }, 35_000);
    const pages = new Map((crawled.pages ?? []).map(p => [p.url, p]));
    return hits.map(h => { const p = pages.get(h.url); return p ? { ...h, snippet: `${h.snippet}\n\nCRAWLED PAGE CONTENT: ${p.text.slice(0, 2800)}` } : h; });
  } catch { return hits; }
}
export function resultsBlock(query: string, hits: WebHit[], today: string): string {
  return [`WEB RESULTS for "${query}" (searched ${today}):`, ...hits.map((h, i) => `${i + 1}. ${h.title}\n   [🌐](${h.url})\n   ${h.snippet}`)].join('\n');
}
