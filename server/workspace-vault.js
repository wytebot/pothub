import crypto from 'node:crypto';

export const WORKSPACE_SYNC_TABLES = Object.freeze([
  'projects', 'runs', 'chats', 'messages', 'attachments', 'videoJobs', 'promptLibrary', 'agents'
]);
const ALLOWED = new Set(WORKSPACE_SYNC_TABLES);

export function isWorkspaceSyncTable(value) { return ALLOWED.has(String(value || '')); }
export function workspaceOwnerKey(userId) {
  return crypto.createHash('sha256').update(String(userId)).digest('hex');
}
export function workspaceItemKey(table, id) {
  return crypto.createHash('sha256').update(`${String(table)}:${String(id)}`).digest('hex');
}
function vaultKey(env = process.env) {
  const secret = String(env.POTHUB_VAULT_ENCRYPTION_KEY || env.SESSION_SECRET || '').trim();
  if (secret.length < 32) throw Object.assign(new Error('Saved API sync is not configured. Set POTHUB_VAULT_ENCRYPTION_KEY to a strong secret of at least 32 characters.'), { status: 503 });
  return crypto.createHash('sha256').update(secret).digest();
}
export function encryptWorkspaceSecret(secret, env = process.env) {
  const value = String(secret || '');
  if (!value || value.length > 2000) throw Object.assign(new Error('Saved API key is empty or exceeds the supported length.'), { status: 422 });
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
}
export function decryptWorkspaceSecret(payload, env = process.env) {
  if (!payload || payload.v !== 1) throw new Error('Saved API key could not be decrypted. Check the vault encryption configuration.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(env), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8');
}
export function safeWorkspacePayload(value, maxBytes = 450 * 1024) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Saved workspace item must be an object.'), { status: 422 });
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json, 'utf8') > maxBytes) throw Object.assign(new Error('A saved item is too large to sync. Export its media in a backup instead.'), { status: 413 });
  return JSON.parse(json);
}
export function compareWorkspaceVersion(a, b) {
  const at = Date.parse(String(a || '')) || 0, bt = Date.parse(String(b || '')) || 0;
  return at === bt ? 0 : at > bt ? 1 : -1;
}
