import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseVerificationMode, nativeEnableMode } from '../src/lib/biometric-policy.js';

test('legacy lock routing supports passcode records while new enrollment can use one authenticator', () => {
  assert.equal(chooseVerificationMode({ native: true, mode: 'native', available: true, hasFallback: true }), 'native-biometric');
  assert.equal(chooseVerificationMode({ native: true, mode: 'native', available: false, hasFallback: true }), 'pin');
  assert.equal(chooseVerificationMode({ native: true, mode: 'pin', available: true, hasFallback: true }), 'pin');
  assert.equal(chooseVerificationMode({ native: true, mode: 'native', available: false, hasFallback: false }), 'recovery-required');
});

test('browser WebAuthn requires its configured authenticator when no legacy PIN fallback exists', () => {
  assert.equal(chooseVerificationMode({ native: false, available: true, hasFallback: true }), 'webauthn');
  assert.equal(chooseVerificationMode({ native: false, available: false, hasFallback: true }), 'pin');
  assert.equal(chooseVerificationMode({ native: false, available: false, hasFallback: false }), 'recovery-required');
});

test('cancelled native biometric enrollment does not enable a different lock method', () => {
  assert.equal(nativeEnableMode({ biometricPromptSucceeded: false }), null);
  assert.equal(nativeEnableMode({ biometricPromptSucceeded: true }), 'native');
});
