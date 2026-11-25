import { describe, expect, it } from 'vitest';
import { parseCommands } from './commands';
import { fallbackScope } from './workflow';
import { interpret } from '../models/router';
import { rankText, textModelsFrom } from '../models/text';
import { wantedOutput } from './deliver';
import { parseMarkdown } from './markdown';
import { friendlyNote } from './friendly';

describe('text slash commands', () => {
  it('extracts speed and model flags while keeping prompt text', () => { const { text, flags } = parseCommands('/fast /model gpt-5 explain APIs'); expect(text).toBe('explain APIs'); expect(flags).toMatchObject({ prefer: 'speed', model: 'gpt-5' }); });
  it('keeps unknown slash commands as ordinary text', () => { expect(parseCommands('explain /usr/bin')).toMatchObject({ text: 'explain /usr/bin' }); });
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
  it('routes all requests through text', () => { for (const p of ['Write a detailed business plan for a bakery','explain DNS','Draw a fox','make a video of waves','make a poster']) expect(interpret(p).task).toBe('text'); });
  it('treats attachments as a question about the file unless an edit is asked for', () => {
    expect(interpret('what is in this', { hasFiles: true }).task).toBe('text');
    expect(interpret('make this photo look like a painting', { hasFiles: true, hasImageFile: true }).task).toBe('text');
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
    expect(friendlyNote(new Error('No text model is available on your connected keys. Add a key in AI Providers.'), { task: 'text' }).providers).toBe(true);
    expect(friendlyNote(Object.assign(new Error('x'), { status: 429 }), { task: 'text', step: 'Writing your answer…' }).text).toContain('writing your answer');
    expect(friendlyNote(new Error('Cancelled.'), { task: 'text' }).cancelled).toBe(true);
  });
});
