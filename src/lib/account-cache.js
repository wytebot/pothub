/**
 * Keep each signed-in account's local workspace in its own IndexedDB partition.
 * Switching accounts must never erase unsynced records from the previous account.
 */
export async function switchLocalWorkspaceAccount(db, tables, previousOwner, nextOwner) {
  if (!previousOwner || previousOwner === nextOwner) return { archived: 0, restored: 0 };
  if (!db.accountCache) throw new Error('Local account cache is unavailable. Refresh PotHub to upgrade its database.');
  let archived = 0;
  let restored = 0;
  const transactionTables = [db.accountCache, ...tables.map(name => db.table(name)), db.settings];
  await db.transaction('rw', ...transactionTables, async () => {
    for (const name of tables) {
      const table = db.table(name);
      const rows = await table.toArray();
      if (rows.length) {
        await db.accountCache.bulkPut(rows.map(row => ({
          key: `${previousOwner}:${name}:${String(row.id)}`,
          owner: String(previousOwner),
          table: name,
          id: String(row.id),
          updatedAt: row.updatedAt || row.createdAt || new Date().toISOString(),
          data: row
        })));
        archived += rows.length;
      }
      await table.clear();
    }
    const saved = await db.accountCache.where('owner').equals(String(nextOwner)).toArray();
    const grouped = new Map(tables.map(name => [name, []]));
    for (const item of saved) {
      if (!grouped.has(item.table) || !item.data || String(item.data.id) !== String(item.id)) continue;
      grouped.get(item.table).push(item.data);
    }
    for (const [name, rows] of grouped) {
      if (rows.length) {
        await db.table(name).bulkPut(rows);
        restored += rows.length;
      }
    }
  });
  return { archived, restored };
}
