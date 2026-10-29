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

/** Constant-time comparison for the Flutterwave verif-hash webhook header. */
export function isValidWebhookSecret(expected, provided) {
  if (typeof expected !== 'string' || !expected || typeof provided !== 'string' || !provided) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Stable marker ID for exactly-once credit grants per account and payment reference. */
export function grantDocumentId(userId, reference) {
  if (!String(userId || '') || !String(reference || '')) throw new TypeError('User ID and reference are required.');
  return crypto.createHash('sha256').update(`${String(userId)}:${String(reference)}`).digest('hex');
}
