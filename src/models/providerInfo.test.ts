import { describe, expect, it } from 'vitest';
import { checkSecret, fieldsOf, fnsOf, joinSecret, splitSecret, PROVIDER_IDS } from './providerInfo';
describe('text-provider credentials', () => {
  it('exposes only text-capable BYOK providers', () => { expect(PROVIDER_IDS).toEqual(['openai', 'gemini', 'xai']); expect(fnsOf('gemini')).toEqual(['text']); expect(fnsOf('xai')).toEqual(['text']); });
  it('keeps one secret field and trims it', () => { expect(fieldsOf('openai')).toHaveLength(1); expect(joinSecret('openai', [' sk-abc '])).toBe('sk-abc'); expect(splitSecret('openai', ' sk-abc ')).toEqual(['sk-abc']); });
  it('rejects keys that are too short', () => { expect(() => checkSecret('openai', ['short'])).toThrow(/too short/); expect(() => checkSecret('gemini', ['1234567890123456'])).not.toThrow(); });
});
