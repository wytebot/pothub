import test from 'node:test';
import assert from 'node:assert/strict';
import { inferRequestedTask, classifyAgentFunction } from '../src/lib/request-intent.js';

test('explicit image creation requests route to Image agents', () => {
  for (const prompt of ['Generate an image of a red car', 'Could you create an image of a logo?', 'Draw a portrait of a cat', 'Make a picture showing a sunset']) assert.equal(inferRequestedTask(prompt), 'image', prompt);
});
test('explicit video creation requests route to Video agents', () => {
  for (const prompt of ['Create a video about ocean waves', 'Could you generate a clip showing a robot?', 'Make an animation of a walking dog']) assert.equal(inferRequestedTask(prompt), 'video', prompt);
});
test('educational and ordinary questions stay in Chat rather than media agents', () => {
  for (const prompt of ['How do I generate an image in Python?', 'Explain how video encoding works', 'Create a function that resizes images', 'What is a video codec?']) assert.equal(inferRequestedTask(prompt), 'chat', prompt);
});


test('explicit debugging requests with code evidence use Diagnosis, not Chat or Fix', () => {
  assert.equal(classifyAgentFunction('Please diagnose this stack trace', {}).task, 'diagnosis');
  assert.equal(classifyAgentFunction('Debug this error', { attachments: [{ name: 'server.log', type: 'text/plain' }] }).task, 'diagnosis');
});

test('explicit code repair requests with evidence use Fix, while ambiguous learning stays Chat', () => {
  assert.equal(classifyAgentFunction('Fix this bug in the repo', { hasRepo: true }).task, 'repair');
  assert.equal(classifyAgentFunction('How do I fix a TypeError in JavaScript?', {}).task, 'chat');
  assert.equal(classifyAgentFunction('Explain this code', { attachments: [{ name: 'app.js', type: 'text/javascript' }] }).task, 'chat');
});
