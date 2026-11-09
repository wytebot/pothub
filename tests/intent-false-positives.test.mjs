import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequest } from '../src/lib/request-intent.js';

const routed = (t, ctx) => classifyRequest(t, ctx).task;

test('real creation requests still reach the Image function', () => {
  for (const t of [
    'generate an image of a cat in a spacesuit',
    'draw a cat',
    'i would like a picture of a sunset over lagos',
    'can you create a logo for my bakery',
    'make a poster for a jazz night',
    'i need a logo for my bakery',
    'create an app icon for my notes app',
    'design a website banner for my shop',
    'logo for my coffee shop',
  ]) assert.equal(routed(t), 'image', t);
});

test('negations, meta-talk and software senses never route to Image or Video', () => {
  for (const t of [
    "don't generate an image, just explain it",
    'no image please',
    'stop making pictures and answer in text',
    'you generated an image earlier, why?',
    'i did not ask you to draw anything',
    'the image is not loading on my page',
    'my docker image build keeps failing',
    'create an image component for my react app',
    'make the image smaller and responsive',
    'draw up a contract for my freelance work',
    'draw a conclusion from this data',
    'illustrate how recursion works',
    'design a database schema for orders',
    'build a website with a hero image',
    'write some ideas for a logo',
    'generate alt text for the picture',
    'create image prompts for my story',
    'thanks',
    'great',
  ]) assert.equal(routed(t), 'chat', t);
});

test('pasted code, logs and long documents are data for Chat', () => {
  assert.equal(routed('create an image of this:\n```js\nconst a = 1;\n```'), 'chat');
  assert.equal(routed('generate an image\nError: ENOENT\n    at open (fs.js:1)\nnpm ERR! failed'), 'chat');
  assert.equal(routed('draw a cat '.repeat(120)), 'chat');
});
