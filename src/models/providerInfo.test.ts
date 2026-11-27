import { describe, expect, it } from 'vitest';
import { ENDPOINTS, PROVIDERS, authHeaders, checkSecret, fieldsOf, fnsOf, joinSecret, splitSecret, PROVIDER_IDS } from './providerInfo';
describe('text-provider credentials', () => {
  it('exposes only text-capable BYOK providers', () => { expect(PROVIDER_IDS).toEqual(['openai', 'gemini', 'xai', 'anthropic', 'deepseek', 'mistral', 'groq', 'openrouter', 'together']); expect(fnsOf('gemini')).toEqual(['text']); expect(fnsOf('xai')).toEqual(['text']); expect(fnsOf('anthropic')).toEqual(['text']); });
  it('sends each key the way its provider expects', () => { expect(authHeaders('anthropic', 'k')['x-api-key']).toBe('k'); expect(authHeaders('groq', 'k').Authorization).toBe('Bearer k'); expect(ENDPOINTS.deepseek.api).toBe('openai'); });
  it('keeps one secret field and trims it', () => { expect(fieldsOf('openai')).toHaveLength(1); expect(joinSecret('openai', [' sk-abc '])).toBe('sk-abc'); expect(splitSecret('openai', ' sk-abc ')).toEqual(['sk-abc']); });
  it('rejects keys that are too short', () => { expect(() => checkSecret('openai', ['short'])).toThrow(/too short/); expect(() => checkSecret('gemini', ['1234567890123456'])).not.toThrow(); });
  it('points people at each provider current key page and API host', () => {
    expect(PROVIDERS.anthropic.keyFrom).toBe('platform.claude.com');
    expect(ENDPOINTS.together.chat).toBe('https://api.together.ai/v1/chat/completions');
    expect(Object.values(PROVIDERS).every((p) => !/MonyGist is free/i.test(p.billing) && /not by MonyGist/.test(p.billing))).toBe(true);
  });
});
