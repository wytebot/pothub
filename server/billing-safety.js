import crypto from 'node:crypto';

const SUCCESS_STATES = new Set(['succeeded', 'successful', 'completed']);

/** Payment verification is always against the persisted order, never client input. */
export function isVerifiedPayment(order, charge) {
  if (!order || !charge || !order.reference || !order.provider_charge_id) return false;
  return SUCCESS_STATES.has(String(charge.status || '').toLowerCase())
    && String(charge.reference || '') === String(order.reference)
    && String(charge.id || '') === String(order.provider_charge_id)
    && String(charge.currency || '').toUpperCase() === String(order.currency || '').toUpperCase()
    && Number.isFinite(Number(charge.amount))
    && Number(charge.amount) === Number(order.amount);
}

/** Flutterwave v4 signs the exact raw request body with HMAC-SHA256/base64.
 * Timestamp is validated separately by the handler to reject stale replays. */
export function isValidWebhookSecret(secretHash, signature, rawBody) {
  if (typeof secretHash !== 'string' || !secretHash || typeof signature !== 'string' || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac('sha256', secretHash).update(rawBody).digest('base64');
  const a = Buffer.from(expected, 'utf8'); const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isFreshWebhookTimestamp(timestamp, now = Date.now(), windowMs = 5 * 60 * 1000) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return false;
  const ms = value < 1e12 ? value * 1000 : value;
  return Math.abs(now - ms) <= windowMs;
}

/** Stable marker ID for exactly-once credit grants per account and payment reference. */
export function grantDocumentId(userId, reference) {
  if (!String(userId || '') || !String(reference || '')) throw new TypeError('User ID and reference are required.');
  return crypto.createHash('sha256').update(`${String(userId)}:${String(reference)}`).digest('hex');
}

/** Validate a settlement forwarded by the registered WyBuild webhook after its
 * direct Flutterwave v4 charge lookup. The shared secret is checked separately. */
export function isValidWyBuildSettlement(order, payload) {
  if (!order || !payload) return false;
  const reference = String(payload.reference || '');
  const id = String(payload.id || '');
  return /^kh[a-f0-9]{32}$/i.test(reference)
    && reference === String(order.reference || '')
    && id.length > 0 && id.length <= 160
    && String(payload.status || '').toLowerCase() === 'succeeded'
    && Number.isFinite(Number(payload.amount))
    && Number(payload.amount) === Number(order.amount)
    && String(payload.currency || '').toUpperCase() === String(order.currency || '').toUpperCase();
}

export function isValidSharedWebhookSecret(expected, supplied, minLength = 32) {
  if (typeof expected !== 'string' || typeof supplied !== 'string' || expected.length < minLength || !supplied) return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
