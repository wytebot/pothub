import test from 'node:test';
import assert from 'node:assert/strict';
import {decideOperation} from '../server/operation-state.js';

test('same operation key and payload returns stored result without rerunning',()=>{
  const existing={userId:'u1',payloadHash:'p1',state:'succeeded',result:{answer:42}};
  assert.deepEqual(decideOperation(existing,{userId:'u1',operationId:'op1',payloadHash:'p1'}),{action:'return',state:'succeeded',result:{answer:42}});
});
test('same operation key with different payload is rejected',()=>{
  assert.throws(()=>decideOperation({userId:'u1',payloadHash:'old',state:'succeeded'},{userId:'u1',operationId:'op1',payloadHash:'new'}),e=>e.code==='IDEMPOTENCY_PAYLOAD_MISMATCH'&&e.status===409);
});
test('running operation blocks concurrent duplicate and expired running state can retry',()=>{
  const running={userId:'u1',payloadHash:'p1',state:'running',expiresAt:new Date(Date.now()+60000),attempt:1};
  assert.throws(()=>decideOperation(running,{userId:'u1',operationId:'op1',payloadHash:'p1'}),e=>e.code==='OPERATION_IN_PROGRESS');
  const stale=decideOperation({...running,expiresAt:new Date(Date.now()-1)},{userId:'u1',operationId:'op1',payloadHash:'p1',now:Date.now()});
  assert.equal(stale.action,'retry');assert.equal(stale.attempt,2);assert.equal(stale.record.state,'running');
});
test('failed operation can reserve again with same idempotency key',()=>{
  const failed=decideOperation({userId:'u1',payloadHash:'p1',state:'failed',attempt:2},{userId:'u1',operationId:'op1',payloadHash:'p1'});
  assert.equal(failed.action,'retry');assert.equal(failed.attempt,3);
});
test('concurrent transaction decisions serialize to one create and one in-progress rejection',async()=>{
  let row=null,lock=Promise.resolve();
  const attempt=()=>{const next=lock.then(()=>{const decision=decideOperation(row,{userId:'u1',operationId:'op1',payloadHash:'p1'});row=decision.record||row;return decision.action});lock=next.catch(()=>{});return next};
  const results=await Promise.allSettled([attempt(),attempt()]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.code==='OPERATION_IN_PROGRESS').length,1);
});
