import { request } from '../security/api';
import { isPremium } from '../quota/daily';

export interface WebHit { title: string; url: string; snippet: string; }
/** Detect requests whose answer depends on current or externally verifiable information. */
export function shouldAutoWebSearch(prompt: string): boolean {
  return /\b(today|right now|currently|current|latest|recent|this week|this month|this year|breaking|news|price|pricing|cost|exchange rate|weather|forecast|schedule|standings|score|who is the richest|newest version|availability|compare.*(202[5-9]|2030)|as of \w+ 20\d{2}|202[5-9]|2030)\b/i.test(prompt);
}

const KEY = 'chat.web.v1';
const USAGE = 'web.free.daily.v1';
export const WEB_CHANGED = 'web:changed';
const day = () => new Date().toISOString().slice(0, 10);
function used(): number { try { const x = JSON.parse(localStorage.getItem(USAGE) ?? 'null') as { day?: string; used?: number } | null; return x?.day === day() ? Math.max(0, Number(x.used) || 0) : 0; } catch { return 0; } }
export const FREE_WEB_DAILY_LIMIT = 3;
export const webRemaining = () => isPremium() ? Infinity : Math.max(0, FREE_WEB_DAILY_LIMIT - used());
export const webWanted = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const webActive = () => webWanted() && webRemaining() > 0;
export function setWebWanted(on: boolean) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ } window.dispatchEvent(new Event(WEB_CHANGED)); }
function consumeFreeSearch() { if (isPremium()) return; try { localStorage.setItem(USAGE, JSON.stringify({ day: day(), used: used() + 1 })); } catch { /* storage blocked */ } window.dispatchEvent(new Event(WEB_CHANGED)); }
export async function webSearch(query: string): Promise<WebHit[]> {
  if (!isPremium() && webRemaining() <= 0) throw new Error('You have used today’s free web-search allowance. Premium includes deeper research.');
  const r = await request<{ results: WebHit[] }>(`/api/search?q=${encodeURIComponent(query)}`, undefined, 20_000);
  const hits = Array.isArray(r.results) ? r.results.slice(0, isPremium() ? 8 : 3) : [];
  consumeFreeSearch();
  return hits;
}
export function resultsBlock(query: string, hits: WebHit[], today: string): string {
  return [`WEB RESULTS for "${query}" (searched ${today}):`, ...hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`)].join('\n');
}
