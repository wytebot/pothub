import { describe, expect, it } from 'vitest';
import { backendUrl, encodeRef, GatewayError, isGatewayRef, parseRef } from './gatewayRef';

describe('backend references', () => {
  it('round-trips provider, address and model, and holds no secret', () => {
    const r = encodeRef({ p: 'openai', g: 'https://b.vercel.app', m: 'gpt-4o' });
    expect(isGatewayRef(r)).toBe(true); expect(parseRef(r)).toEqual({ p: 'openai', g: 'https://b.vercel.app', m: 'gpt-4o' });
    expect(parseRef(encodeRef({ p: 'groq', g: 'https://b.example' }))).toEqual({ p: 'groq', g: 'https://b.example' });
  });
  it('does not treat an ordinary key or a damaged reference as a reference', () => {
    expect(parseRef('sk-abc123')).toBeNull(); expect(isGatewayRef('sk-abc123')).toBe(false);
    expect(parseRef('pothub-backend:%%%')).toBeNull(); expect(parseRef(`pothub-backend:${btoa('{"p":1}')}`)).toBeNull();
  });
  it('marks backend problems so they are not mistaken for provider errors', () => {
    const e = new GatewayError('nope', 403); expect(e.gateway).toBe(true); expect(e.status).toBe(403); expect(e).toBeInstanceOf(Error);
  });
});

describe('backend address', () => {
  it('accepts what people paste and returns the base address', () => {
    expect(backendUrl('https://my-backend.vercel.app')).toBe('https://my-backend.vercel.app');
    expect(backendUrl(' my-backend.vercel.app/ ')).toBe('https://my-backend.vercel.app');
    expect(backendUrl('https://my-backend.vercel.app/api/agent')).toBe('https://my-backend.vercel.app');
    expect(backendUrl('https://host.example/pothub/api/agent/info')).toBe('https://host.example/pothub');
    expect(backendUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });
  it('refuses plain http, passwords and nonsense', () => {
    expect(() => backendUrl('http://my-backend.example.com')).toThrow(/https/);
    expect(() => backendUrl('https://user:pw@my-backend.example.com')).toThrow(/passwords/);
    expect(() => backendUrl('not a url at all')).toThrow(/web address/);
  });
});
