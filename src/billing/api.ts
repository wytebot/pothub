import { Capacitor } from '@capacitor/core';
const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
export const apiConfigured = !!API;
const LIC = 'billing.license'; const UNTIL = 'billing.entitledUntil'; const PEND = 'billing.pending';

async function call<T>(path: string, o: { method?: string; body?: unknown; license?: string; token?: string } = {}): Promise<T> {
  if (!API) throw new Error('No billing server is configured for this build (VITE_API_URL).');
  let r: Response;
  try { r = await fetch(`${API}${path}`, { method: o.method ?? 'GET', headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.token || o.license ? { Authorization: `Bearer ${o.token ?? o.license}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined, signal: AbortSignal.timeout(45_000) }); }
  catch { throw new Error('Could not reach the billing server. Check your connection and try again.'); }
  const j = await r.json().catch(() => ({})) as T & { error?: string };
  if (r.status === 409) throw Object.assign(new Error(j.error ?? 'Price changed.'), { priceChanged: (j as { amountNgn?: number }).amountNgn });
  if (!r.ok) throw new Error(j.error ?? (r.status === 401 ? 'That license was not recognised.' : 'The billing server returned an error. Try again shortly.'));
  return j;
}
export interface Rates { usdNgn: number; monthlyNgn: number; annualNgn: number; asOf: string; roundedUpToNearest?: number; }
export interface Status { entitled: boolean; plan: string | null; status: string; currentPeriodEnd: string | null; }
export interface Payment { reference: string; amount: number; currency: string; at?: string; }
export type Plan = 'monthly' | 'annual';
export const getRates = () => call<Rates>('/api/rates');
export const getConfig = () => call<{ checkoutEnabled: boolean; live: boolean }>('/api/config');
export const storedLicense = () => localStorage.getItem(LIC) ?? '';
export const history = (l: string) => call<{ payments: Payment[] }>('/api/billing/history', { license: l });

/** Premium is cached locally only after the server confirms it. */
export async function verifyLicense(license: string): Promise<Status> {
  const s = await call<Status>('/api/subscription/status', { license: license.trim() });
  localStorage.setItem(LIC, license.trim());
  if (s.currentPeriodEnd) localStorage.setItem('billing.lastUntil', String(new Date(s.currentPeriodEnd).getTime()));
  if (s.entitled && s.currentPeriodEnd) localStorage.setItem(UNTIL, String(new Date(s.currentPeriodEnd).getTime())); else localStorage.removeItem(UNTIL);
  return s;
}
export const clearLicense = () => { localStorage.removeItem(LIC); localStorage.removeItem(UNTIL); };

export type PayState = 'pin' | 'otp' | 'redirect' | 'address' | 'unsupported' | 'pending' | 'paid' | 'failed';
export interface PayStep { state: PayState; txRef?: string; claim?: string; redirectUrl?: string; license?: string; reason?: string; }
export interface StartInput { plan: Plan; expectedNgn: number; email: string; name: string; phone: string; phoneCode: string; card: { number: string; month: string; year: string; cvv: string }; }
const pend = (): { txRef: string; claim: string } | null => { try { return JSON.parse(localStorage.getItem(PEND) ?? 'null'); } catch { return null; } };
export const hasPendingPayment = () => !!pend();
export const clearPending = () => localStorage.removeItem(PEND);

async function finish(s: PayStep): Promise<PayStep> {
  if (s.state === 'paid' && s.license) { await verifyLicense(s.license); clearPending(); window.dispatchEvent(new Event('billing:licensed')); }
  if (s.state === 'failed') clearPending();
  return s;
}
/** The card details exist only in this request body: they are never written to storage or logs. */
export async function payStart(i: StartInput): Promise<PayStep> {
  const s = await call<PayStep>('/api/pay/start', { method: 'POST', body: i });
  if (s.txRef && s.claim) localStorage.setItem(PEND, JSON.stringify({ txRef: s.txRef, claim: s.claim }));
  return finish(s);
}
export async function payAuthorize(a: { pin?: string; otp?: string }): Promise<PayStep> { const p = pend(); if (!p) throw new Error('No payment in progress.'); return finish(await call<PayStep>('/api/pay/authorize', { method: 'POST', body: { ...p, ...a } })); }
export async function payStatus(): Promise<PayStep | null> { const p = pend(); if (!p) return null; return finish(await call<PayStep>('/api/pay/status', { method: 'POST', body: p })); }
/** Account-linked licence recovery. Authenticated with the Firebase ID token; the licence never leaves the signed-in user's own record. */
export const linkLicenseToAccount = (token: string, license: string) => call<{ linked: boolean }>('/api/account/link', { method: 'POST', token, body: { license } });
export const restoreLicenseFromAccount = (token: string) => call<{ license: string }>('/api/account/license', { token });
export async function openUrl(url: string) { if (Capacitor.isNativePlatform()) { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url }); } else window.open(url, '_blank', 'noopener'); }
