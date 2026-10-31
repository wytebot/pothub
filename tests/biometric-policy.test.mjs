import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseVerificationMode, nativeEnableMode } from '../src/lib/biometric-policy.js';

test('native biometric routing always has an explicit passcode fallback path', () => {
  assert.equal(chooseVerificationMode({ native: true, mode: 'native', available: true, hasFallback: true }), 'native-biometric');
  assert.equal(chooseVerificationMode({ native: true, mode: 'native', available: false, hasFallback: true }), 'pin');
  assert.equal(chooseVerificationMode({ native: true, mode: 'pin', available: true, hasFallback: true }), 'pin');
  assert.equal(chooseVerificationMode({ native: true, mode: 'native', available: false, hasFallback: false }), 'recovery-required');
});

test('browser WebAuthn uses server passcode fallback when the authenticator is unavailable', () => {
  assert.equal(chooseVerificationMode({ native: false, available: true, hasFallback: true }), 'webauthn');
  assert.equal(chooseVerificationMode({ native: false, available: false, hasFallback: true }), 'pin');
  assert.equal(chooseVerificationMode({ native: false, available: false, hasFallback: false }), 'recovery-required');
});

test('cancelled native biometric enrollment retains a usable passcode-only lock', () => {
  assert.equal(nativeEnableMode({ biometricPromptSucceeded: false }), 'pin');
  assert.equal(nativeEnableMode({ biometricPromptSucceeded: true }), 'native');
});
