import Dexie from 'dexie';

// Local-first workspace data. Migrate the earlier Kithub database once so existing users
// keep their projects and history after the Pothub rebrand.
export const db = new Dexie('pothub-local');
db.version(1).stores({
  projects: 'id,owner,name,connectedAt,updatedAt',
  tasks: 'id,projectId,createdAt,status,kind',
  settings: 'key',
  creditEvents: 'id,createdAt,kind',
  reports: 'id,projectId,createdAt'
});

let migrationPromise;
function readLegacyStore(name) {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open('kithub-local'); } catch { resolve([]); return; }
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const old = req.result;
      if (!old.objectStoreNames.contains(name)) { old.close(); resolve([]); return; }
      try {
        const tx = old.transaction(name, 'readonly');
        const get = tx.objectStore(name).getAll();
        get.onsuccess = () => { const rows = get.result || []; old.close(); resolve(rows); };
        get.onerror = () => { old.close(); resolve([]); };
      } catch { old.close(); resolve([]); }
    };
  });
}
export async function migrateLegacyData() {
  if (!migrationPromise) migrationPromise = (async () => {
    const marker = await db.settings.get('pothub_legacy_migrated');
    if (marker?.value) return;
    const stores = ['projects', 'tasks', 'settings', 'creditEvents', 'reports'];
    await db.open();
    for (const name of stores) {
      const current = await db.table(name).count();
      if (current === 0) {
        const rows = await readLegacyStore(name);
        if (rows.length) await db.table(name).bulkPut(rows);
      }
    }
    await db.settings.put({ key: 'pothub_legacy_migrated', value: true });
  })().catch(() => {});
  return migrationPromise;
}
export async function getSetting(key, fallback = null) {
  await migrateLegacyData();
  const r = await db.settings.get(key);
  return r ? r.value : fallback;
}
export async function setSetting(key, value) {
  await migrateLegacyData();
  return db.settings.put({ key, value });
}
export function uid() { return crypto.randomUUID?.() || `ph_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
export async function saveProject(repo) {
  await migrateLegacyData();
  const item = { ...repo, id: repo.id || `${repo.owner}/${repo.name}`, connectedAt: repo.connectedAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  await db.projects.put(item);
  return item;
}
