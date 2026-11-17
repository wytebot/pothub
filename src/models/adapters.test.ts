import { describe, expect, it } from 'vitest';
import { dims, sniffMime } from './http';
import { IMAGE_MODELS, VIDEO_MODELS } from './registry';
import { PROVIDERS } from './providerInfo';
import { buildCatalog } from '../agent/detect';

describe('sizes', () => {
  it('keeps the ratio and rounds to the grid', () => {
    expect(dims('1:1', 1024, 64)).toEqual({ w: 1024, h: 1024 });
    expect(dims('16:9', 1024, 32)).toEqual({ w: 1024, h: 576 });
    expect(dims('9:16', 1024, 32)).toEqual({ w: 576, h: 1024 });
  });
  it('recognises image bytes', () => {
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
  });
});
describe('model list', () => {
  it('has unique ids and a known provider for every model', () => {
    const ids = [...IMAGE_MODELS, ...VIDEO_MODELS].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of [...IMAGE_MODELS, ...VIDEO_MODELS]) expect(PROVIDERS[m.provider]).toBeTruthy();
  });
  it('offers built-in models for providers that cannot list models, without calling them unverified', () => {
    const c = buildCatalog({}, ['fal', 'luma']);
    expect(c.unverified).toEqual([]);
    expect(c.image.some((m) => m.provider === 'fal')).toBe(true);
    expect(c.video.some((m) => m.provider === 'luma')).toBe(true);
  });
  it('keeps Sora even though the model list may not show it', () => {
    const c = buildCatalog({ openai: [{ id: 'gpt-image-1', methods: [] }] }, ['openai']);
    expect(c.video.map((m) => m.id)).toContain('sora-2');
  });
});
