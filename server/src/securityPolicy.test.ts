import test from 'node:test';
import assert from 'node:assert/strict';
import { roleFor, validUsageRequest } from './securityPolicy.ts';

test('usage reservation validation rejects malformed and oversized values', () => {
  assert.equal(validUsageRequest('image', 4), true);
  assert.equal(validUsageRequest('image', 5), false);
  assert.equal(validUsageRequest('video', 1), true);
  assert.equal(validUsageRequest('video', 2), false);
  assert.equal(validUsageRequest('image', 0), false);
  assert.equal(validUsageRequest('admin', 1), false);
});

test('roles are derived only from the server UID allowlist', () => {
  const admins = new Set(['trusted-admin-uid']);
  assert.equal(roleFor('trusted-admin-uid', admins), 'admin');
  assert.equal(roleFor('client-supplied-admin', admins), 'user');
});
