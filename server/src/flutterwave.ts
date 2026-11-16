// Flutterwave v4 Payment Orchestrator, card flow with PIN / OTP authorization.
// Confirmed from Flutterwave's v4 guides: OAuth client-credentials token; POST /orchestration/direct-charges (X-Trace-Id, X-Idempotency-Key);
// card fields encrypted with AES-256-GCM using the base64 encryption key and a 12-char nonce; data.next_action.type values;
// PUT /charges/{id} with authorization {type:'pin', pin:{nonce, encrypted_pin}}; GET /charges/{id}; statuses like "succeeded".
// NOT confirmed (check on your first live payment): the exact OTP body (`otp:{code}`, sent unencrypted here), the production host, and the sample base URLs.
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import type { Tx } from './billing';

const LIVE = process.env.FLW_ENV === 'production';
const BASE = process.env.FLW_BASE_URL || (LIVE ? 'https://api.flutterwave.cloud/f4b/production' : 'https://developersandbox-api.flutterwave.com');
const TOKEN_URL = 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';
export const isLive = () => LIVE;
let cached: { token: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;
  const id = process.env.FLW_CLIENT_ID, secret = process.env.FLW_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Flutterwave credentials are not configured.');
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error('Flutterwave authentication failed.');
  const j = await r.json() as { access_token: string; expires_in?: number };
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 600) * 1000 }; return cached.token;
}

export class FlwError extends Error { constructor(public status: number, public path: string) { super(`Flutterwave ${path} failed (${status})`); } }
async function api<T>(method: string, path: string, body?: unknown, idem?: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', 'X-Trace-Id': randomUUID(), 'X-Idempotency-Key': idem ?? randomUUID() }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new FlwError(r.status, path.replace(/\/chg_[A-Za-z0-9]+/, '/{id}')); // never include request or response bodies: they can contain card data
  return r.json() as Promise<T>;
}

/** AES-256-GCM, key = base64 encryption key, IV = the 12-character nonce, output = base64(ciphertext + auth tag). */
export function encryptField(value: string, nonce: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64'); if (key.length !== 32) throw new Error('FLW_ENCRYPTION_KEY must decode to 32 bytes.');
  if (nonce.length !== 12) throw new Error('nonce must be 12 characters');
  const c = createCipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'));
  return Buffer.concat([c.update(value, 'utf8'), c.final(), c.getAuthTag()]).toString('base64');
}
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const newNonce = () => Array.from(randomBytes(12), (b) => ALNUM[b % 62]).join('');
const encKey = () => { const k = process.env.FLW_ENCRYPTION_KEY; if (!k) throw new Error('FLW_ENCRYPTION_KEY is not configured.'); return k; };

export type Next = 'none' | 'pin' | 'otp' | 'redirect' | 'address' | 'unsupported';
export interface ChargeResult { id: string; status: Tx['status']; next: Next; redirectUrl?: string; amount: number; currency: string; reference: string; }
const status = (s: unknown): Tx['status'] => { const v = String(s ?? '').toLowerCase(); return v === 'succeeded' || v === 'successful' ? 'successful' : v === 'failed' || v === 'cancelled' || v === 'timeout' ? 'failed' : 'pending'; };
function toResult(d: any): ChargeResult {
  const t = String(d?.next_action?.type ?? '');
  const next: Next = t === 'requires_pin' ? 'pin' : t === 'requires_otp' ? 'otp' : t === 'redirect_url' ? 'redirect' : t === 'requires_additional_fields' ? 'address' : t ? 'unsupported' : 'none';
  return { id: String(d?.id ?? ''), status: status(d?.status), next, redirectUrl: d?.next_action?.redirect_url?.url, amount: Number(d?.amount ?? 0), currency: String(d?.currency ?? ''), reference: String(d?.reference ?? '') };
}

export interface CardInput { number: string; month: string; year: string; cvv: string; }
export async function startCardCharge(o: { reference: string; amountNgn: number; email: string; first: string; last: string; phoneCode: string; phone: string; card: CardInput; redirectUrl: string }): Promise<ChargeResult> {
  const nonce = newNonce(); const k = encKey();
  const j = await api<{ data: unknown }>('POST', '/orchestration/direct-charges', {
    amount: o.amountNgn, currency: 'NGN', reference: o.reference, redirect_url: o.redirectUrl,
    payment_method: { type: 'card', card: { nonce, encrypted_card_number: encryptField(o.card.number, nonce, k), encrypted_expiry_month: encryptField(o.card.month, nonce, k), encrypted_expiry_year: encryptField(o.card.year, nonce, k), encrypted_cvv: encryptField(o.card.cvv, nonce, k) } },
    customer: { email: o.email, name: { first: o.first, last: o.last }, phone: { country_code: o.phoneCode, number: o.phone } },
  }, o.reference);
  return toResult(j.data);
}
export async function authorizeCharge(chargeId: string, a: { pin: string } | { otp: string }): Promise<ChargeResult> {
  let authorization: unknown;
  if ('pin' in a) { const nonce = newNonce(); authorization = { type: 'pin', pin: { nonce, encrypted_pin: encryptField(a.pin, nonce, encKey()) } }; }
  else authorization = { type: 'otp', otp: { code: a.otp } };
  return toResult((await api<{ data: unknown }>('PUT', `/charges/${encodeURIComponent(chargeId)}`, { authorization })).data);
}
export async function getCharge(chargeId: string): Promise<ChargeResult> { return toResult((await api<{ data: unknown }>('GET', `/charges/${encodeURIComponent(chargeId)}`)).data); }
export const toTx = (c: ChargeResult): Tx => ({ id: c.id, status: c.status, amount: c.amount, currency: c.currency, reference: c.reference });
