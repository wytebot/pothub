/** US dollar to naira, for showing what a bill is in naira. Tries two public rate sources, then the last rate that worked. */
const LS = 'fx.usdngn.v1';
export interface Fx { rate: number; at: number; live: boolean; }

const getJson = async (url: string): Promise<unknown> => {
  const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error('rate unavailable');
  return r.json();
};
const sources: (() => Promise<number>)[] = [
  async () => Number(((await getJson('https://open.er-api.com/v6/latest/USD')) as { rates?: { NGN?: number } }).rates?.NGN),
  async () => Number(((await getJson('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json')) as { usd?: { ngn?: number } }).usd?.ngn),
];
const cached = (): Fx | null => { try { const v = JSON.parse(localStorage.getItem(LS) ?? 'null') as Fx | null; return v && v.rate > 0 ? { ...v, live: false } : null; } catch { return null; } };

export async function usdToNgn(): Promise<Fx | null> {
  const c = cached();
  if (c && Date.now() - c.at < 6 * 3_600_000) return c;
  for (const s of sources) {
    try { const rate = await s(); if (Number.isFinite(rate) && rate > 100) { const v = { rate, at: Date.now(), live: true }; try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* ignore */ } return v; } } catch { /* try the next source */ }
  }
  return c;
}
/** Rounded up to the nearest ₦10, the same way the billing server prices it. */
export const ngnFor = (usd: number, rate: number, step = 10) => Math.ceil((usd * rate) / step) * step;
