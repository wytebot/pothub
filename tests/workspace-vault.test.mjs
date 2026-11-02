import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkspaceSyncTable, workspaceOwnerKey, workspaceItemKey,
  encryptWorkspaceSecret, decryptWorkspaceSecret, safeWorkspacePayload,
  compareWorkspaceVersion
} from '../server/workspace-vault.js';

const env = { POTHUB_VAULT_ENCRYPTION_KEY: 'pothub-test-vault-key-which-is-long-enough-123456789' };

test('workspace vault encrypts API keys at rest and authenticates ciphertext', () => {
  const encrypted = encryptWorkspaceSecret('sk-provider-secret-1234567890', env);
  assert.notEqual(encrypted.data, 'sk-provider-secret-1234567890');
  assert.equal(decryptWorkspaceSecret(encrypted, env), 'sk-provider-secret-1234567890');
  assert.throws(() => decryptWorkspaceSecret(encrypted, { POTHUB_VAULT_ENCRYPTION_KEY: 'a-different-vault-key-which-is-also-long-enough-123456' }));
});

test('workspace item scope is account-isolated and IDs are opaque', () => {
  assert.notEqual(workspaceOwnerKey('github-user-a'), workspaceOwnerKey('github-user-b'));
  assert.match(workspaceOwnerKey('github-user-a'), /^[a-f0-9]{64}$/);
  assert.match(workspaceItemKey('agents', 'agent-1'), /^[a-f0-9]{64}$/);
  assert.notEqual(workspaceItemKey('agents', 'agent-1'), workspaceItemKey('chats', 'agent-1'));
});

test('only supported account workspace tables can sync', () => {
  assert.equal(isWorkspaceSyncTable('agents'), true);
  assert.equal(isWorkspaceSyncTable('promptLibrary'), true);
  assert.equal(isWorkspaceSyncTable('credit_ledger'), false);
  assert.equal(isWorkspaceSyncTable('__proto__'), false);
});

test('workspace payload is JSON-only and bounded below Firestore document limit', () => {
  assert.deepEqual(safeWorkspacePayload({ id: 'a', title: 'saved' }), { id: 'a', title: 'saved' });
  assert.throws(() => safeWorkspacePayload(['not', 'an', 'object']), /must be an object/);
  assert.throws(() => safeWorkspacePayload({ text: 'x'.repeat(460 * 1024) }), /too large/);
});

test('workspace conflict resolver compares timestamps safely', () => {
  assert.equal(compareWorkspaceVersion('2026-10-31T10:00:00.000Z', '2026-10-31T09:00:00.000Z'), 1);
  assert.equal(compareWorkspaceVersion('2026-10-31T09:00:00.000Z', '2026-10-31T10:00:00.000Z'), -1);
  assert.equal(compareWorkspaceVersion('invalid', ''), 0);
});
