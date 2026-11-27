import { describe, it, expect } from 'vitest';
import { parsePublicGithubUrl, isPremium } from '../forge.js';

describe('Forge input safety', () => {
  it('accepts public GitHub repository URLs', () => expect(parsePublicGithubUrl('https://github.com/owner/repo.git')).toBe('owner/repo'));
  it('rejects non-GitHub and query-bearing URLs', () => {
    expect(parsePublicGithubUrl('https://github.com/owner/repo?token=x')).toBe(null);
    expect(parsePublicGithubUrl('http://github.com/owner/repo')).toBe(null);
    expect(parsePublicGithubUrl('https://evil.example/owner/repo')).toBe(null);
  });
});

describe('Forge Premium entitlement', () => {
  it('allows active Premium custom claims', () => expect(isPremium({ claims: { premium: true } })).toBe(true));
  it('allows Pro plan claims', () => expect(isPremium({ claims: { pothubPlan: 'pro' } })).toBe(true));
  it('rejects Free users and expired Premium claims', () => {
    expect(isPremium({ claims: {} })).toBe(false);
    const expired = { claims: { premium: true, pothubProUntil: Math.floor(Date.now() / 1000) - 10 } };
    expect(isPremium(expired)).toBe(false);
  });
});
