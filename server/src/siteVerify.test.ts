import test from 'node:test';
import assert from 'node:assert/strict';
import { hasVerificationTag, verificationTag, verificationToken } from './siteVerify.ts';

test('token is stable per account and host, and differs across accounts and hosts', () => {
  const a = verificationToken('u1', 'example.com', 'k'); assert.ok(a?.startsWith('pothub-'));
  assert.equal(a, verificationToken('u1', 'www.Example.com', 'k'));
  assert.notEqual(a, verificationToken('u2', 'example.com', 'k'));
  assert.notEqual(a, verificationToken('u1', 'other.com', 'k'));
  assert.equal(verificationToken('u1', 'example.com', ''), null);
});

test('tag is found in head only, in any attribute order, and must match the token', () => {
  const t = 'pothub-abc';
  assert.ok(hasVerificationTag(`<html><head><title>x</title>${verificationTag(t)}</head><body></body></html>`, t));
  assert.ok(hasVerificationTag(`<head><META CONTENT='${t}' NAME='pothub-site-verification' /></head>`, t));
  assert.equal(hasVerificationTag(`<head></head><body>${verificationTag(t)}</body>`, t), false);
  assert.equal(hasVerificationTag(`<head>${verificationTag('pothub-other')}</head>`, t), false);
});
