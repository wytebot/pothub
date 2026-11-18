import { describe, expect, it } from 'vitest';
import { parseCommands } from './commands';
import { buildCatalog } from './detect';
import { fallbackScope } from './workflow';
import { interpret, planImage } from '../models/router';
import { rankText, textModelsFrom } from '../models/text';
import { wantedOutput } from './deliver';
import { parseMarkdown } from './markdown';
import { friendlyNote } from './friendly';

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

describe('what a request is asking for', () => {
  it('sends questions, writing and documents to a text model', () => {
    for (const p of ['Write a detailed business plan for a bakery', 'explain how DNS works', 'What is the capital of Ghana?', 'Write a script for a 60 second video about coffee', 'how do I make a video of my product', 'design a database schema for a school']) expect(interpret(p).task).toBe('text');
  });
  it('keeps scene descriptions and media requests for image and video models', () => {
    expect(interpret('A futuristic city skyline at golden hour').task).toBe('image');
    expect(interpret('make a poster for my church event').task).toBe('image');
    expect(interpret('Draw a fox').task).toBe('image');
    expect(interpret('make a video of waves crashing').task).toBe('video');
    expect(interpret('A 10-second cinematic video of Lagos at night').task).toBe('video');
  });
  it('treats attachments as a question about the file unless an edit is asked for', () => {
    expect(interpret('what is in this', { hasFiles: true }).task).toBe('text');
    expect(interpret('make this photo look like a painting', { hasFiles: true, hasImageFile: true }).task).toBe('edit');
  });
});

describe('text models and output formats', () => {
  it('lists only chat models from the live list and prefers the newest', () => {
    const m = textModelsFrom('gemini', [{ id: 'gemini-2.5-pro', methods: ['generateContent'] }, { id: 'gemini-3-flash', methods: ['generateContent'] }, { id: 'gemini-2.5-flash-image', methods: ['generateContent'] }, { id: 'gemini-embedding-001', methods: ['embedContent'] }]);
    expect(m.map((x) => x.id).sort()).toEqual(['gemini-2.5-pro', 'gemini-3-flash']);
    expect(rankText(m, 'quality')[0].id).toBe('gemini-2.5-pro');
    expect(rankText(m, 'speed')[0].id).toBe('gemini-3-flash');
    const o = textModelsFrom('openai', [{ id: 'gpt-5', methods: [] }, { id: 'gpt-5-2025-08-07', methods: [] }, { id: 'gpt-image-1', methods: [] }, { id: 'gpt-5-mini', methods: [] }, { id: 'gpt-5-pro', methods: [] }, { id: 'text-embedding-3-small', methods: [] }]);
    expect(o.map((x) => x.id).sort()).toEqual(['gpt-5', 'gpt-5-mini']);
  });
  it('picks the format from the wording', () => {
    expect(wantedOutput('explain DNS').file).toBe(false);
    expect(wantedOutput('write a report as a pdf').format).toBe('pdf');
    expect(wantedOutput('give me a csv of 10 users').format).toBe('csv');
    expect(wantedOutput('export it as a word doc').format).toBe('docx');
  });
  it('reads markdown into blocks', () => {
    const b = parseMarkdown('# T\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n```js\nlet a=1\n```');
    expect(b.map((x) => x.t)).toEqual(['h', 'list', 'table', 'code']);
  });
});

describe('friendly notes', () => {
  it('explains a missing key kindly and names the step on other failures', () => {
    expect(friendlyNote(new Error('No video model is available on your connected keys. Add a key in AI Providers.'), { task: 'video' }).providers).toBe(true);
    expect(friendlyNote(Object.assign(new Error('x'), { status: 429 }), { task: 'text', step: 'Writing your answer…' }).text).toContain('writing your answer');
    expect(friendlyNote(new Error('Cancelled.'), { task: 'text' }).cancelled).toBe(true);
  });
});
