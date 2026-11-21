import { describe, expect, it } from 'vitest';
import { accessFor, authHeaders, settings, targetFor, withModel, variableNames } from './agent.js';

const env = { POTHUB_PROVIDER: 'OpenAI', POTHUB_API_KEY: ' sk-SECRET ', POTHUB_MODEL: 'gpt-4o', POTHUB_ALLOWED_EMAILS: 'Dev@Example.com, other@example.com' };

describe('backend settings', () => {
  it('is ready when all four variables are set, and trims and lowercases', () => {
    expect(settings(env)).toMatchObject({ provider: 'openai', key: 'sk-SECRET', model: 'gpt-4o', missing: [], ready: true });
  });
  it('names exactly what is missing, never the key', () => {
    const s = settings({ POTHUB_PROVIDER: 'nope', POTHUB_API_KEY: 'sk-SECRET' });
    expect(s.ready).toBe(false); expect(s.missing.join(' | ')).toContain('POTHUB_MODEL'); expect(s.missing.join(' | ')).toContain('POTHUB_ALLOWED_EMAILS'); expect(s.missing.join(' | ')).toContain('POTHUB_PROVIDER (use one of');
    expect(JSON.stringify(s.missing)).not.toContain('sk-SECRET');
  });
  it('supports safe custom environment-variable names for key and model', () => {
    const custom = { POTHUB_PROVIDER_ENV: 'MY_AI_PROVIDER', POTHUB_API_KEY_ENV: 'MY_SECRET_KEY', POTHUB_MODEL_ENV: 'MY_MODEL_ID', POTHUB_ALLOWED_EMAILS_ENV: 'AUTHORIZED_USERS', MY_AI_PROVIDER: 'openai', MY_SECRET_KEY: 'sk-test', MY_MODEL_ID: 'gpt-4o-mini', AUTHORIZED_USERS: 'dev@example.com' };
    expect(variableNames(custom)).toEqual({ provider: 'MY_AI_PROVIDER', key: 'MY_SECRET_KEY', model: 'MY_MODEL_ID', allowedEmails: 'AUTHORIZED_USERS' });
    expect(settings(custom)).toMatchObject({ provider: 'openai', key: 'sk-test', model: 'gpt-4o-mini', ready: true, missing: [] });
  });
  it('rejects unsafe custom environment-variable names and falls back to defaults', () => { expect(variableNames({ POTHUB_API_KEY_ENV: 'BAD;NAME' }).key).toBe('POTHUB_API_KEY'); });
  it('rejects odd model names', () => { expect(settings({ ...env, POTHUB_MODEL: 'gpt-4o; drop' }).ready).toBe(false); expect(settings({ ...env, POTHUB_MODEL: 'meta-llama/llama-3.3-70b:free' }).ready).toBe(true); });
});

describe('who may use the backend', () => {
  it('is closed without POTHUB_ALLOWED_EMAILS', () => { expect(accessFor({ uid: 'u', email: 'a@b.c', emailVerified: true }, {})).toMatchObject({ ok: false, status: 503 }); });
  it('allows a verified listed email only', () => {
    expect(accessFor({ uid: 'x', email: 'dev@example.com', emailVerified: true }, env).ok).toBe(true);
    expect(accessFor({ uid: 'x', email: 'dev@example.com', emailVerified: false }, env)).toMatchObject({ ok: false, status: 403 });
    expect(accessFor({ uid: 'x', email: 'stranger@example.com', emailVerified: true }, env)).toMatchObject({ ok: false, status: 403 });
  });
});

describe('what the backend will forward', () => {
  it('allows chat and model-list calls at the fixed provider address', () => {
    expect(targetFor('openai', 'https://api.openai.com/v1/chat/completions', 'POST', 'gpt-4o')).toBe('https://api.openai.com/v1/chat/completions');
    expect(targetFor('openai', 'https://api.openai.com/v1/models', 'GET', 'gpt-4o')).toBe('https://api.openai.com/v1/models');
    expect(targetFor('anthropic', 'https://api.anthropic.com/v1/models?limit=1000&evil=1', 'GET', 'm')).toBe('https://api.anthropic.com/v1/models?limit=1000');
  });
  it('forces the backend model into Gemini addresses and drops stolen key parameters', () => {
    const u = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-ultra-expensive:streamGenerateContent?alt=sse&key=stolen';
    expect(targetFor('gemini', u, 'POST', 'gemini-2.5-flash')).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
    expect(targetFor('gemini', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', 'GET', 'x')).toContain('pageSize=1000');
  });
  it('forces the backend model into every other chat body', () => {
    expect(withModel('openai', { model: 'gpt-expensive', messages: [1] }, 'gpt-4o')).toEqual({ model: 'gpt-4o', messages: [1] });
    expect(withModel('gemini', { contents: [] }, 'x')).toEqual({ contents: [] });
    expect(withModel('openai', null, 'gpt-4o')).toEqual({});
  });
  it('refuses other hosts, paths, methods and ports', () => {
    expect(targetFor('openai', 'https://evil.example/v1/chat/completions', 'POST', 'm')).toBeNull();
    expect(targetFor('openai', 'https://api.openai.com/v1/files', 'POST', 'm')).toBeNull();
    expect(targetFor('openai', 'https://api.openai.com/v1/chat/completions', 'GET', 'm')).toBeNull();
    expect(targetFor('openai', 'https://api.openai.com:8443/v1/models', 'GET', 'm')).toBeNull();
    expect(targetFor('openai', 'http://api.openai.com/v1/models', 'GET', 'm')).toBeNull();
    expect(targetFor('gemini', 'https://generativelanguage.googleapis.com/v1beta/tunedModels', 'GET', 'm')).toBeNull();
    expect(targetFor('openai', 'https://api.anthropic.com/v1/messages', 'POST', 'm')).toBeNull();
  });
  it('puts the key in the provider\'s own header', () => {
    expect(authHeaders('openai', 'k')).toEqual({ Authorization: 'Bearer k' }); expect(authHeaders('gemini', 'k')).toEqual({ 'x-goog-api-key': 'k' }); expect(authHeaders('anthropic', 'k')['x-api-key']).toBe('k');
  });
});
