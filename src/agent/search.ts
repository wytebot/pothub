import { request } from '../security/api';
import { isPremium } from '../quota/daily';

/** Web search, run through Pothub's own service because browsers cannot call a search engine directly. Premium only. */
export interface WebHit { title: string; url: string; snippet: string; }
const KEY = 'chat.web.v1';
export const WEB_CHANGED = 'web:changed';

export const webWanted = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
/** The switch only counts while Premium is active. */
export const webActive = () => webWanted() && isPremium();
export function setWebWanted(on: boolean) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ } window.dispatchEvent(new Event(WEB_CHANGED)); }

export async function webSearch(query: string): Promise<WebHit[]> {
  const r = await request<{ results: WebHit[] }>(`/api/search?q=${encodeURIComponent(query)}`, undefined, 20_000);
  return Array.isArray(r.results) ? r.results.slice(0, 8) : [];
}

/** The block added to the person's message so the model can use (and cite) what was found. */
export function resultsBlock(query: string, hits: WebHit[], today: string): string {
  return [`WEB RESULTS for "${query}" (searched ${today}):`, ...hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`)].join('\n');
}
