import test from 'node:test';
import assert from 'node:assert/strict';
import { diffHunks, applySelectedHunks } from '../src/ui/codelab/diff-hunks.js';

test('diffHunks returns no changes for identical text',()=>assert.deepEqual(diffHunks('a\nb','a\nb'),[]));
test('selected hunks apply only accepted changes',()=>{
 const before='one\ntwo\nthree\nfour\nfive\nsix\nseven';
 const after='ONE\ntwo\nthree\nfour\nFIVE\nsix\nseven';
 const hunks=diffHunks(before,after,1);
 assert.equal(hunks.length,2);
 const result=applySelectedHunks(before,hunks,new Set([hunks[0].id]));
 assert.equal(result,'ONE\ntwo\nthree\nfour\nfive\nsix\nseven');
});
test('stale source is rejected rather than overwritten',()=>{
 const hunks=diffHunks('a\nb','a\nB');
 assert.throws(()=>applySelectedHunks('changed\nb',hunks,new Set([hunks[0].id])),/source changed/i);
});
test('large files use bounded full-replacement fallback',()=>{
 const before=Array.from({length:1001},(_,i)=>`a${i}`).join('\n');
 const after=Array.from({length:1001},(_,i)=>`b${i}`).join('\n');
 const hunks=diffHunks(before,after);
 assert.equal(hunks.length,1); assert.equal(hunks[0].oversized,true);
});
