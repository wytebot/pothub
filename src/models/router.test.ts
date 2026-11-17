import { describe, expect, it } from 'vitest';
import { interpret, planImage } from './router';

describe('router', () => {
  it('detects video and edit intents', () => {
    expect(interpret('Create a 10-second advertisement').task).toBe('video');
    expect(interpret('Make this photograph look cinematic').task).toBe('edit');
    expect(interpret('a luxury apartment').task).toBe('image');
  });
  it('maps vertical to 9:16 and picks a model that supports it', () => {
    const p = planImage({ prompt: 'vertical poster of a lighthouse', prefer: 'quality', connected: new Set(['openai', 'gemini']) });
    expect(p.kind === 'ready' && p.aspect).toBe('9:16');
    expect(p.kind === 'ready' && p.model.provider).toBe('gemini');
  });
  it('tells the user when it had to use the closest ratio', () => {
    const p = planImage({ prompt: 'vertical poster', prefer: 'quality', connected: new Set(['openai']) });
    expect(p.kind === 'ready' && p.notes.length).toBe(1);
  });
  it('honours a preferred model when it can do the job', () => {
    const p = planImage({ prompt: 'a cat', prefer: 'speed', preferredModel: 'gpt-image-1', connected: new Set(['openai', 'gemini']) });
    expect(p.kind === 'ready' && p.model.id).toBe('gpt-image-1');
  });
  it('blocks when no key is connected', () => {
    expect(planImage({ prompt: 'a cat', prefer: 'speed', connected: new Set() }).kind).toBe('blocked');
  });
});
