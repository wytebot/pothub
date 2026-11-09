import crypto from 'node:crypto';

/** Flutterwave v4 helpers. v4 has no hosted-checkout endpoint: a payment is customer -> payment method -> charge.
 * Card fields are AES-256-GCM encrypted with the dashboard encryption key before they leave this server. */

const NONCE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function generateNonce() {
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, b => NONCE_CHARS[b % NONCE_CHARS.length]).join('');
}

export function cleanEnvValue(v) {
  return String(v || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
}

/** Encrypt one card field. Output is base64(ciphertext || 16-byte GCM tag); the 12-character nonce is sent beside it. */
export function encryptCardField(plain, nonce, encryptionKey) {
  const key = Buffer.from(cleanEnvValue(encryptionKey), 'base64');
  if (key.length !== 32) throw Object.assign(new Error('FLW_ENCRYPTION_KEY must be the 32-byte base64 encryption key from the Flutterwave v4 dashboard.'), { status: 503 });
  if (typeof nonce !== 'string' || Buffer.byteLength(nonce) !== 12) throw new Error('Nonce must be exactly 12 characters.');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'));
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return data.toString('base64');
}

export function luhnValid(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

/** Validate and normalise raw card input. Never log the return value. */
export function normalizeCard(input = {}) {
  const number = String(input.number || '').replace(/[\s-]/g, '');
  const month = String(input.expiryMonth || '').replace(/\D/g, '').padStart(2, '0');
  let year = String(input.expiryYear || '').replace(/\D/g, '');
  if (year.length === 4) year = year.slice(2);
  const cvv = String(input.cvv || '').replace(/\D/g, '');
  if (!/^\d{12,19}$/.test(number) || !luhnValid(number)) throw Object.assign(new Error('Enter a valid card number.'), { status: 422 });
  if (!/^(0[1-9]|1[0-2])$/.test(month) || !/^\d{2}$/.test(year)) throw Object.assign(new Error('Enter a valid card expiry date.'), { status: 422 });
  const now = new Date(), cy = now.getUTCFullYear() % 100, cm = now.getUTCMonth() + 1;
  if (Number(year) < cy || (Number(year) === cy && Number(month) < cm)) throw Object.assign(new Error('This card has expired.'), { status: 422 });
  if (!/^\d{3,4}$/.test(cvv)) throw Object.assign(new Error('Enter the card security code.'), { status: 422 });
  return { number, month, year, cvv };
}

export function buildPaymentMethodBody(card, encryptionKey, nonce = generateNonce()) {
  return {
    type: 'card',
    card: {
      encrypted_card_number: encryptCardField(card.number, nonce, encryptionKey),
      encrypted_expiry_month: encryptCardField(card.month, nonce, encryptionKey),
      encrypted_expiry_year: encryptCardField(card.year, nonce, encryptionKey),
      encrypted_cvv: encryptCardField(card.cvv, nonce, encryptionKey),
      nonce
    }
  };
}

const CALLING_CODES = ['1', '7', '20', '27', '33', '34', '39', '44', '49', '52', '55', '61', '81', '86', '91', '212', '213', '216', '220', '221', '225', '231', '233', '234', '237', '241', '243', '244', '249', '250', '251', '254', '255', '256', '260', '263', '264', '265', '266', '267', '268', '971'];
export function parsePhone(raw) {
  const v = String(raw || '').trim();
  if (!v.startsWith('+')) return null;
  const digits = v.replace(/\D/g, '');
  for (const len of [3, 2, 1]) {
    const cc = digits.slice(0, len);
    if (CALLING_CODES.includes(cc) && digits.length - len >= 6 && digits.length - len <= 12) return { country_code: cc, number: digits.slice(len) };
  }
  return null;
}

export function buildCustomerBody({ email, name, phone }) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const first = parts.shift() || 'PotHub', last = parts.join(' ') || first;
  const body = { email: String(email).trim().toLowerCase(), name: { first, last } };
  const p = parsePhone(phone);
  if (p) body.phone = p;
  return body;
}

export function buildChargeBody({ order, customerId, paymentMethodId, redirectUrl }) {
  return {
    reference: order.reference,
    currency: String(order.currency || 'USD').toUpperCase(),
    amount: Number(order.amount),
    customer_id: customerId,
    payment_method_id: paymentMethodId,
    redirect_url: redirectUrl,
    meta: { app: 'pothub', pack: String(order.pack_id || '') }
  };
}

/** Normalise a v4 charge's next step. Only 3-D Secure style redirects are completed in-browser. */
export function nextActionOf(charge) {
  const action = charge?.next_action || null;
  const status = String(charge?.status || '').toLowerCase();
  if (['succeeded', 'successful', 'completed'].includes(status)) return { type: 'none', status: 'succeeded' };
  if (['failed', 'cancelled', 'canceled', 'declined', 'voided', 'rejected'].includes(status)) return { type: 'failed', status };
  if (action?.type === 'redirect_url') {
    const url = String(action.redirect_url?.url || '');
    if (/^https:\/\//i.test(url)) return { type: 'redirect', url, status: status || 'pending' };
  }
  if (action?.type) return { type: 'unsupported', actionType: String(action.type), status: status || 'pending' };
  return { type: 'pending', status: status || 'pending' };
}

export function splitProviderError(data, fallback) {
  const e = data?.error || {};
  return String(e.message || data?.message || e.type || fallback || 'Flutterwave request failed.').slice(0, 300);
}
