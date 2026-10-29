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


/** Validate a proposed GitHub commit before any write API call. */
export function validateCommitPayload(input) {
  if (!input || !/^[A-Za-z0-9_.-]{1,100}$/.test(String(input.owner || '')) || !/^[A-Za-z0-9_.-]{1,100}$/.test(String(input.repo || ''))) {
    throw new TypeError('Choose a valid GitHub owner and repository.');
  }
  if (!/^[A-Za-z0-9_.\/-]{1,250}$/.test(String(input.baseBranch || '')) || String(input.baseBranch).startsWith('/') || String(input.baseBranch).split('/').some(p => !p || p === '.' || p === '..')) {
    throw new TypeError('Choose a valid base branch.');
  }
  if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > 8) throw new TypeError('A commit must contain between 1 and 8 files.');
  const seen = new Set(); let total = 0;
  for (const file of input.files) {
    const path = String(file?.path || '');
    const content = String(file?.content ?? '');
    if (!path || path.length > 240 || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..') || /[\u0000-\u001f\u007f]/.test(path)) throw new TypeError(`Blocked unsafe repository path: ${path.slice(0, 80)}`);
    if (/(^|\/)\.env($|\.)|(^|\/)(secrets?|credentials?)(\.|$)|private[-_]?key|id_rsa/i.test(path)) throw new TypeError(`Blocked potentially sensitive path: ${path}`);
    if (seen.has(path)) throw new TypeError(`Duplicate file path in commit: ${path}`);
    seen.add(path);
    if (content.length > 90000) throw new TypeError(`File is too large to commit safely: ${path}`);
    if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(content) || /(?:gh[pousr]_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{35,}|FLWSECK_[A-Za-z0-9_-]{20,})/.test(content)) throw new TypeError(`Potential secret detected in proposed file: ${path}`);
    total += Buffer.byteLength(content, 'utf8');
  }
  if (total > 400000) throw new TypeError('Total commit payload exceeds the 400 KB safety limit. Split the patch into smaller commits.');
  return true;
}
