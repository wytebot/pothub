import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImage, generateImage } from '../server/image-adapters.js';

test('image adapter normalizes supported binary payloads',()=>{
  const image=normalizeImage(Buffer.from('png-data').toString('base64'),'image/png',2);
  assert.equal(image.filename,'pothub-image-2.png');
  assert.equal(image.mimeType,'image/png');
  assert.equal(Buffer.from(image.contentBase64,'base64').toString(),'png-data');
});
test('image adapter rejects unsupported mime types and empty output',()=>{
  assert.throws(()=>normalizeImage('', 'image/png'),/empty/);
  assert.throws(()=>normalizeImage(Buffer.from('x').toString('base64'),'text/plain'),/unsupported/);
});
test('unwired image providers fail closed rather than returning fake output',async()=>{
  await assert.rejects(()=>generateImage({provider:'runway',key:'x',model:'model'},{prompt:'hello'}),/not implemented/);
});
