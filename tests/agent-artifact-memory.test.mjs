import test from 'node:test';
import assert from 'node:assert/strict';
import { isDebugOrRepairRequest, rememberGeneratedArtifact, getLatestGeneratedArtifact } from '../src/lib/agent-artifact-memory.js';

function fakeDb() {
  const settings = new Map(), attachments = new Map();
  return {
    settings: { put: async row => settings.set(row.key, row), get: async key => settings.get(key) },
    attachments: { put: async row => attachments.set(row.id, row), get: async id => attachments.get(id) },
  };
}

test('debug/repair intent is recognized without matching unrelated requests', () => {
  assert.equal(isDebugOrRepairRequest('Please debug the last generated file'), true);
  assert.equal(isDebugOrRepairRequest('Patch the failing build'), true);
  assert.equal(isDebugOrRepairRequest('Write a poem about the ocean'), false);
});

test('latest generated artifact is account scoped and reloads its stored blob', async () => {
  const db = fakeDb();
  const blob = new Blob(['console.log("hello")'], { type: 'text/javascript' });
  await db.attachments.put({ id: 'artifact-1', name: 'app.js', type: blob.type, size: blob.size, blob, createdAt: new Date().toISOString() });
  assert.equal(await rememberGeneratedArtifact(db, 'user-a', { id: 'artifact-1', name: 'app.js' }), true);
  const loaded = await getLatestGeneratedArtifact(db, 'user-a');
  assert.equal(loaded.name, 'app.js');
  assert.equal(await loaded.blob.text(), 'console.log("hello")');
  assert.equal(await getLatestGeneratedArtifact(db, 'user-b'), null);
});
