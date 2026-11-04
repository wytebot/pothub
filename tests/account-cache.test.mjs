import test from 'node:test';
import assert from 'node:assert/strict';
import { switchLocalWorkspaceAccount } from '../src/lib/account-cache.js';

function makeTable(rows = []) {
  const values = new Map(rows.map(row => [String(row.id), structuredClone(row)]));
  return {
    async toArray() { return [...values.values()].map(row => structuredClone(row)); },
    async clear() { values.clear(); },
    async bulkPut(rows) { for (const row of rows) values.set(String(row.id), structuredClone(row)); },
    async get(id) { return values.get(String(id)); },
    values
  };
}
function makeDb(initial) {
  const tables = Object.fromEntries(Object.entries(initial).map(([name, rows]) => [name, makeTable(rows)]));
  const cacheRows = new Map();
  const accountCache = {
    async bulkPut(rows) { for (const row of rows) cacheRows.set(row.key, structuredClone(row)); },
    where(field) { return { equals(value) { return { async toArray() { return [...cacheRows.values()].filter(row => row[field] === value).map(row => structuredClone(row)); } }; } }; },
    cacheRows
  };
  const settings = makeTable([]);
  return {
    ...tables, accountCache, settings,
    table(name) { return this[name]; },
    async transaction(_mode, ...args) { const callback = args.at(-1); return callback(); }
  };
}

test('switching accounts archives unsynced local rows and restores only the destination account', async () => {
  const db = makeDb({ agents: [{ id: 'agent-a', label: 'A' }], chats: [{ id: 'chat-a', title: 'A chat' }] });
  const first = await switchLocalWorkspaceAccount(db, ['agents', 'chats'], 'account-a', 'account-b');
  assert.deepEqual(first, { archived: 2, restored: 0 });
  assert.equal((await db.agents.toArray()).length, 0);
  assert.equal((await db.chats.toArray()).length, 0);
  await db.accountCache.bulkPut([{ key: 'account-b:agents:agent-b', owner: 'account-b', table: 'agents', id: 'agent-b', data: { id: 'agent-b', label: 'B' } }]);
  const second = await switchLocalWorkspaceAccount(db, ['agents', 'chats'], 'account-b', 'account-a');
  assert.deepEqual(second, { archived: 0, restored: 2 });
  const third = await switchLocalWorkspaceAccount(db, ['agents', 'chats'], 'account-a', 'account-b');
  assert.equal(third.restored, 1);
  assert.deepEqual(await db.agents.toArray(), [{ id: 'agent-b', label: 'B' }]);
  assert.deepEqual(await db.chats.toArray(), []);
});

test('same-account and first-account sync do not partition or clear local data', async () => {
  const db = makeDb({ agents: [{ id: 'agent-a' }] });
  assert.deepEqual(await switchLocalWorkspaceAccount(db, ['agents'], '', 'account-a'), { archived: 0, restored: 0 });
  assert.deepEqual(await switchLocalWorkspaceAccount(db, ['agents'], 'account-a', 'account-a'), { archived: 0, restored: 0 });
  assert.equal((await db.agents.toArray()).length, 1);
});
