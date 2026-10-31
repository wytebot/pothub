import { encryptSecret, decryptSecret } from './agents';
import { switchLocalWorkspaceAccount } from './account-cache';

export const CLOUD_TABLES = ['projects','runs','chats','messages','attachments','videoJobs','promptLibrary','agents'];
const OWNER_KEY = 'cloud-sync-owner-v1';
const KNOWN_KEY = 'cloud-sync-known-v1';
const SYNC_PAGE_SIZE = 500;
const PUSH_BATCH_SIZE = 8;

function isBinary(value) {
  return (typeof Blob !== 'undefined' && value instanceof Blob) || value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}
export function stripLocalBinary(value, path = '') {
  if (isBinary(value)) return undefined;
  if (Array.isArray(value)) return value.map((item, index) => stripLocalBinary(item, `${path}.${index}`)).filter(item => item !== undefined);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'blob' || key === 'mediaBlob' || key === 'objectUrl' || key === 'dataUrl') continue;
      const clean = stripLocalBinary(item, path ? `${path}.${key}` : key);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }
  return value;
}
function rowVersion(row) { return Math.max(Date.parse(String(row?.updatedAt || '')) || 0, Date.parse(String(row?.videoJob?.updatedAt || '')) || 0, Date.parse(String(row?.createdAt || '')) || 0); }
async function localPayload(table, row) {
  const payload = stripLocalBinary(row);
  if (table === 'agents') {
    if (!row.secret) throw new Error(`Saved API agent “${row.label || row.id}” has no encrypted key on this device.`);
    payload.secretPlain = await decryptSecret(row.secret);
    delete payload.secret;
  }
  return payload;
}
async function fromCloud(table, payload) {
  const row = { ...payload };
  if (table === 'agents') {
    if (!row.secretPlain) throw new Error(`Saved API agent “${row.label || row.id}” is missing its cloud-encrypted key.`);
    row.secret = await encryptSecret(row.secretPlain);
    delete row.secretPlain;
  }
  return row;
}
async function readRemote(api) {
  const items = [];
  let cursor = '';
  for (let page = 0; page < 200; page++) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const result = await api(`/api/workspace/sync${query}`, { timeoutMs: 30000, noRetry: false });
    items.push(...(result.items || []));
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
    if (page === 199) throw new Error('Workspace sync contains too many records for one pass. Retry after reducing old history.');
  }
  return items;
}
export async function syncAccountWorkspace({ db, api, user, onStatus = () => {} }) {
  if (!user?.id) return { skipped: true };
  onStatus('Checking cloud workspace…');
  const owner = String(user.id);
  const savedOwner = await db.settings.get(OWNER_KEY);
  if (savedOwner?.value && savedOwner.value !== owner) {
    // Partition rather than clear: preserve any offline/unsynced work for the
    // previous account, then restore this account's own local cache.
    const switched = await switchLocalWorkspaceAccount(db, CLOUD_TABLES, String(savedOwner.value), owner);
    onStatus(`Switched account workspace · preserved ${switched.archived} local items`);
  }
  await db.settings.put({ key: OWNER_KEY, value: owner });
  const knownKey = `${KNOWN_KEY}:${owner}`;
  let known = {};
  try {
    const scopedKnown = await db.settings.get(knownKey);
    const legacyKnown = savedOwner?.value === owner ? await db.settings.get(KNOWN_KEY) : null;
    known = JSON.parse(scopedKnown?.value || legacyKnown?.value || '{}') || {};
  } catch {}
  const before = {};
  for (const table of CLOUD_TABLES) before[table] = await db.table(table).toArray();
  const remoteItems = await readRemote(api);
  const remoteByKey = new Map(remoteItems.map(item => [`${item.table}:${item.id}`, item]));
  const deletes = [];
  for (const table of CLOUD_TABLES) {
    const localRows = before[table], localIds = new Set(localRows.map(row => String(row.id)));
    for (const oldId of (Array.isArray(known[table]) ? known[table] : [])) {
      if (!localIds.has(String(oldId)) && !remoteByKey.has(`${table}:${oldId}`)) {
        // A prior remote tombstone was already acknowledged.
        continue;
      }
      if (!localIds.has(String(oldId))) {
        const remote = remoteByKey.get(`${table}:${oldId}`);
        if (remote && !remote.deleted) deletes.push({ table, id: String(oldId), updatedAt: new Date().toISOString() });
      }
    }
  }
  const pending = [];
  const pendingDeleteKeys = new Set(deletes.map(item => `${item.table}:${item.id}`));
  for (const item of remoteItems) {
    if (pendingDeleteKeys.has(`${item.table}:${item.id}`)) continue;
    if (!CLOUD_TABLES.includes(item.table) || !item.id) continue;
    const local = await db.table(item.table).get(item.id);
    if (item.deleted) {
      if (local && rowVersion(local) <= (Date.parse(item.updatedAt || '') || 0)) await db.table(item.table).delete(item.id);
      continue;
    }
    if (!item.data) continue;
    if (!local || rowVersion(item.data) > rowVersion(local)) {
      const restored = await fromCloud(item.table, item.data);
      await db.table(item.table).put(restored);
    } else {
      const localData = await localPayload(item.table, local);
      const localChanged = rowVersion(local) > rowVersion(item.data) || JSON.stringify(localData) !== JSON.stringify(item.data);
      if (localChanged) pending.push({ table: item.table, id: String(local.id), updatedAt: local.updatedAt || local.videoJob?.updatedAt || local.createdAt || new Date().toISOString(), data: localData });
    }
  }
  for (const table of CLOUD_TABLES) {
    const remoteIds = new Set(remoteItems.filter(item => item.table === table && !item.deleted).map(item => String(item.id)));
    const localRows = await db.table(table).toArray();
    for (const row of localRows) {
      if (!remoteIds.has(String(row.id))) pending.push({ table, id: String(row.id), updatedAt: row.updatedAt || row.createdAt || new Date().toISOString(), data: await localPayload(table, row) });
    }
  }
  // Deduplicate pushes, keeping the newest local copy.
  const unique = new Map();
  for (const item of pending) {
    const key = `${item.table}:${item.id}`, prior = unique.get(key);
    if (!prior || rowVersion(item) >= rowVersion(prior)) unique.set(key, item);
  }
  const pushes = [...unique.values()];
  let saved = 0, removed = 0;
  for (let i = 0; i < pushes.length; i += PUSH_BATCH_SIZE) {
    const result = await api('/api/workspace/sync', { method: 'POST', body: JSON.stringify({ items: pushes.slice(i, i + PUSH_BATCH_SIZE), deleted: [] }), timeoutMs: 30000, noRetry: true, idempotencyKey: `workspace-sync-${owner}-${Date.now()}-${i}` });
    saved += Number(result.saved || 0);
  }
  if (deletes.length) {
    for (let i = 0; i < deletes.length; i += PUSH_BATCH_SIZE) {
      const result = await api('/api/workspace/sync', { method: 'POST', body: JSON.stringify({ items: [], deleted: deletes.slice(i, i + PUSH_BATCH_SIZE) }), timeoutMs: 30000, noRetry: true, idempotencyKey: `workspace-delete-${owner}-${Date.now()}-${i}` });
      removed += Number(result.deleted || 0);
    }
  }
  const nextKnown = {};
  for (const table of CLOUD_TABLES) nextKnown[table] = (await db.table(table).toArray()).map(row => String(row.id));
  await db.settings.put({ key: knownKey, value: JSON.stringify(nextKnown) });
  onStatus(`Synced ${pushes.length} saved items${removed ? ` · ${removed} removed` : ''}`);
  return { pulled: remoteItems.length, pushed: pushes.length, deleted: removed };
}
