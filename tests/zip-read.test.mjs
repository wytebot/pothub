import test from 'node:test';
import assert from 'node:assert/strict';
import { zipReadRequests, ZIP_READ_HINT } from '../src/lib/zip-read.js';

const readable = ['src/App.jsx', 'src/lib/db.js', 'server/app.js', 'package.json'];

test('zip pothub-read requests resolve to real zip files and folders only', () => {
  const reply = 'Let me look.\n```pothub-read\nsrc/App.jsx\nserver/\nmissing/file.js\n```';
  assert.deepEqual(zipReadRequests(reply, readable), ['src/App.jsx', 'server/app.js']);
});

test('replies without a pothub-read block ask for nothing', () => {
  assert.deepEqual(zipReadRequests('All done.', readable), []);
});

test('the hint tells the agent never to ask the user to tag or attach files', () => {
  assert.match(ZIP_READ_HINT, /pothub-read/);
  assert.match(ZIP_READ_HINT, /Never ask the user to attach or tag/);
});

test('App wires the zip read-back loop and no longer asks users to re-attach', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
  assert.match(src, /readZipAttachments\(zipSrc\.blob/);
  assert.match(src, /\.\.\.zipExtra/);
  assert.doesNotMatch(src, /ask the user to attach them separately/);
});
