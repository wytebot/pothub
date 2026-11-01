import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');

test('Google Firebase user restoration does not depend solely on preferred-role Dexie row', () => {
  assert.match(source, /isGoogleAccount=\(current\.providerData\|\|\[\]\)\.some\(p=>p\.providerId==='google\.com'\)\|\|current\.providerId==='google\.com'/);
  assert.match(source, /if\(isGoogleAccount\|\|preferredAuth\?\.value==='Creator'\)/);
});

test('ID token listener recognizes Google provider and validates returned PotHub user', () => {
  assert.match(source, /providerIsGoogle=\(current\.providerData\|\|\[\]\)\.some\(p=>p\.providerId==='google\.com'\)\|\|current\.providerId==='google\.com'/);
  assert.match(source, /Firebase authenticated you, but PotHub did not return an authenticated user/);
});

test('Firebase session exchange remains single-flight per ID token', () => {
  assert.match(source, /if\(firebaseExchangeFlights\.has\(idToken\)\)return firebaseExchangeFlights\.get\(idToken\)/);
});
