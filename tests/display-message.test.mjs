import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDisplayMessage } from '../src/lib/display-message.js';

test('removes the PotHub deployment hostname from popup text', () => {
  const value = cleanDisplayMessage('Request failed at https://pothub-self.vercel.app/api/health');
  assert.equal(value.includes('pothub-self.vercel.app'), false);
  assert.equal(value.includes('https://'), false);
  assert.match(value, /the service/);
});

test('removes other deployment URLs and preserves useful error detail', () => {
  const value = cleanDisplayMessage('Could not reach https://example.vercel.app/api/run (HTTP 503)');
  assert.equal(value.includes('example.vercel.app'), false);
  assert.match(value, /HTTP 503/);
});

test('bounds popup text and supplies a safe fallback', () => {
  assert.equal(cleanDisplayMessage(''), 'Something went wrong. Try again.');
  assert.equal(cleanDisplayMessage('x'.repeat(900)).length, 500);
});
