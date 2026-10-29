import test from 'node:test';
import assert from 'node:assert/strict';
import {createZip,readZip} from '../src/lib/backup.js';

test('backup ZIP writer and reader preserve names and bytes',()=>{
  const input=[{name:'backup.json',data:new TextEncoder().encode('{"schemaVersion":2}')},{name:'media/test.bin',data:new Uint8Array([0,1,2,127,128,255])}];
  const zip=createZip(input),out=readZip(zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength));
  assert.equal(new TextDecoder().decode(out.get('backup.json')),'{"schemaVersion":2}');
  assert.deepEqual([...out.get('media/test.bin')],[0,1,2,127,128,255]);
});
test('backup ZIP reader rejects corrupted data',()=>{
  const zip=createZip([{name:'backup.json',data:new TextEncoder().encode('ok')}]);
  zip[30+'backup.json'.length]^=1;
  assert.throws(()=>readZip(zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength)));
});

test('backup sanitizer redacts provider and GitHub keys from text',async()=>{
  const {sanitizeBackupData}=await import('../src/lib/backup.js');
  const clean=sanitizeBackupData({message:'key=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890 and ghp_abcdefghijklmnopqrstuvwxyz1234567890'});
  assert.doesNotMatch(clean.message,/sk-proj-abcdefghijklmnopqrstuvwxyz|ghp_abcdefghijklmnopqrstuvwxyz/);
  assert.match(clean.message,/REDACTED/);
});
