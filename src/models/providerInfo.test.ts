import { describe, expect, it } from 'vitest';
import { checkSecret, fieldsOf, fnsOf, joinSecret, splitSecret } from './providerInfo';

describe('credential boxes', () => {
  it('Kling has two boxes, every other provider one', () => {
    expect(fieldsOf('kling').map((f) => f.id)).toEqual(['access', 'secret']);
    expect(fieldsOf('openai')).toHaveLength(1);
  });
  it('joins and splits Kling credentials, tolerating other separators', () => {
    expect(joinSecret('kling', [' AK123456 ', 'SK123456'])).toBe('AK123456:SK123456');
    expect(splitSecret('kling', 'AK123456:SK123456')).toEqual(['AK123456', 'SK123456']);
    expect(splitSecret('kling', 'AK123456\nSK123456')).toEqual(['AK123456', 'SK123456']);
    expect(splitSecret('openai', ' sk-abc ')).toEqual(['sk-abc']);
  });
  it('names the box that is missing', () => {
    expect(() => checkSecret('kling', ['AK123456', ''])).toThrow(/Secret Key/);
    expect(() => checkSecret('kling', ['AK123456'])).toThrow(/Secret Key/);
    expect(() => checkSecret('kling', ['AK123456', 'SK123456'])).not.toThrow();
    expect(() => checkSecret('openai', ['short'])).toThrow(/too short/);
  });
  it('maps providers to the functions they can serve', () => {
    expect(fnsOf('gemini')).toEqual(['image', 'video', 'text']);
    expect(fnsOf('stability')).toEqual(['image']);
    expect(fnsOf('luma')).toEqual(['image', 'video']);
  });
});
