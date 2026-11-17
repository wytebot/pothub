import { describe, expect, it } from 'vitest';
import { parseCommands } from './commands';
import { buildCatalog } from './detect';
import { fallbackScope } from './workflow';
import { planImage } from '../models/router';

describe('slash commands', () => {
  it('extracts flags and keeps the prompt clean', () => {
    const { text, flags } = parseCommands('/fast /9:16 /n 3 a neon fox and/or a lamp');
    expect(text).toBe('a neon fox and/or a lamp');
    expect(flags).toMatchObject({ prefer: 'speed', aspect: '9:16', count: 3 });
  });
  it('leaves unknown slashes alone and clamps the count', () => {
    expect(parseCommands('draw /usr/bin /n 9 cat').flags.count).toBe(4);
    expect(parseCommands('draw /usr/bin cat').text).toBe('draw /usr/bin cat');
  });
});

describe('model detection', () => {
  const gem = (ids: [string, string[]][]) => ids.map(([id, methods]) => ({ id, methods }));
  it('drops retired seed models and finds new ones', () => {
    const c = buildCatalog({ gemini: gem([['gemini-2.5-flash-image', ['generateContent']], ['gemini-9-pro-image', ['generateContent']], ['veo-3.1-fast-generate-preview', ['predictLongRunning']], ['veo-4.0-generate', ['predictLongRunning']], ['gemini-3-flash', ['generateContent']]]) }, ['gemini']);
    expect(c.image.map((m) => m.id)).toEqual(['gemini-2.5-flash-image', 'gemini-9-pro-image']);
    expect(c.video.map((m) => m.id)).toEqual(['veo-3.1-fast-generate-preview', 'veo-4.0-generate']);
    expect(c.image.find((m) => m.id === 'gemini-9-pro-image')?.discovered).toBe(true);
    expect(c.text?.id).toBe('gemini-3-flash');
  });
  it('keeps seed models for a provider that could not be checked', () => {
    const c = buildCatalog({}, ['openai']);
    expect(c.image.map((m) => m.id)).toContain('gpt-image-1'); expect(c.unverified).toEqual(['openai']);
  });
  it('routing respects the live catalog and the exclude list', () => {
    const c = buildCatalog({ gemini: gem([['gemini-2.5-flash-image', ['generateContent']]]) }, ['gemini']);
    const p = planImage({ prompt: 'a cat', prefer: 'quality', connected: new Set(['gemini']), models: c.image });
    expect(p.kind === 'ready' && p.model.id).toBe('gemini-2.5-flash-image');
    expect(planImage({ prompt: 'a cat', prefer: 'quality', connected: new Set(['gemini']), models: c.image, exclude: new Set(['gemini-2.5-flash-image']) }).kind).toBe('blocked');
  });
});

describe('fallback rules', () => {
  it('tries another model on server errors, another provider on auth/quota, nothing on cancel or safety', () => {
    expect(fallbackScope(Object.assign(new Error('x'), { status: 503 }))).toBe('model');
    expect(fallbackScope(Object.assign(new Error('x'), { status: 429 }))).toBe('provider');
    expect(fallbackScope(Object.assign(new Error('x'), { status: 402 }))).toBe('provider');
    expect(fallbackScope(new Error('Cancelled.'))).toBe('none');
    expect(fallbackScope(new Error('blocked by safety filters'))).toBe('none');
  });
});
