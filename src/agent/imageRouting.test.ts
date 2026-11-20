import { describe, expect, it } from 'vitest';
import { interpret } from '../models/router';
import { detectCodeWork } from './codeWork';

describe('a picture request goes to the image model, whatever its subject mentions', () => {
  it('even when the subject contains a document word (story, code, table, email...)', () => {
    for (const p of ['Create an image of a girl reading a story', 'generate a picture of a code editor', 'create an image of a table with food', 'make me a picture of my dog writing an email', 'generate an image of a server room', 'make an image of the app login page', 'produce an image of a dashboard', 'create a picture of a robot building the app', 'generate image of a developer fixing a bug']) expect(interpret(p).task, p).toBe('image');
  });
  it('still sends writing and documents to the text model', () => {
    for (const p of ['write a story about a dragon', 'create a table of prices', 'make a report on sales', 'explain how images work', 'write a script for a video about coffee', 'how do I make an image smaller', 'create a summary of this article', 'make a document about photography']) expect(interpret(p).task, p).toBe('text');
  });
  it('keeps video requests as video', () => {
    expect(interpret('make a video of waves crashing').task).toBe('video');
    expect(interpret('create a thumbnail for my video').task).toBe('video');
  });
  it('an attached document means the work is on it, unless the wording says it is a picture of something', () => {
    expect(interpret('what is in this', { hasFiles: true }).task).toBe('text');
    expect(interpret('create an image of a lion', { hasFiles: true }).task).toBe('image');
    expect(interpret('make this photo look like a painting', { hasFiles: true, hasImageFile: true }).task).toBe('edit');
  });
});

describe('code requests never take a picture request', () => {
  const ctx = { afterCode: true };
  it('is not hijacked after a code conversation', () => {
    for (const p of ['create an image of a lion', 'make a logo for my app', 'improve this photo', 'fix this picture', 'make this image better', 'design an app icon', 'draw a fox', 'generate a wallpaper of a forest']) {
      expect(detectCodeWork(p, ctx), p).toBeNull();
      expect(interpret(p, { code: ctx, hasFiles: false }).task, p).not.toBe('text');
    }
    expect(interpret('fix this photo', { code: ctx, hasFiles: true, hasImageFile: true }).task).not.toBe('text');
  });
  it('still handles code that mentions images', () => {
    expect(detectCodeWork('fix the image upload bug', ctx)?.task).toBe('fix');
    expect(detectCodeWork('debug the image gallery component', ctx)?.task).toBe('debug');
  });
});
