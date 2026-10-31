import test from 'node:test';
import assert from 'node:assert/strict';
import {beginOperation,finishOperation,failOperation,exchangeFirebaseSessionOnce} from '../server/lib.js';

class FakeFirestore {
  constructor(){this.rows=new Map();this.lock=Promise.resolve()}
  collection(name){return {doc:id=>({name,id,key:`${name}/${id}`,get:async()=>this.snapshot(`${name}/${id}`),set:async(data,opts={})=>this.write(`${name}/${id}`,data,opts),create:async data=>this.create(`${name}/${id}`,data),update:async data=>this.write(`${name}/${id}`,data,{merge:true})})}}
  snapshot(key){const value=this.rows.get(key);return {exists:!!value,data:()=>value}}
  write(key,data,{merge=false}={}){this.rows.set(key,merge?{...(this.rows.get(key)||{}),...data}:data)}
  create(key,data){if(this.rows.has(key))throw new Error('already exists');this.rows.set(key,data)}
  runTransaction(fn){const run=this.lock.then(()=>fn({get:async ref=>this.snapshot(ref.key),create:(ref,data)=>this.create(ref.key,data),set:(ref,data,opts)=>this.write(ref.key,data,opts),update:(ref,data)=>this.write(ref.key,data,{merge:true}),delete:ref=>this.rows.delete(ref.key)}));this.lock=run.catch(()=>{});return run}
}

test('Firestore operation handler serializes duplicates, stores result, and permits failed retry',async()=>{
  const store=new FakeFirestore(),args=['u1','op-handler-0001','payload-hash'];
  const concurrent=await Promise.allSettled([beginOperation(...args,{store}),beginOperation(...args,{store})]);
  assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(concurrent.filter(x=>x.status==='rejected'&&x.reason.code==='OPERATION_IN_PROGRESS').length,1);
  await finishOperation(...args,{answer:'stored'},store);
  const replay=await beginOperation(...args,{store});assert.equal(replay.state,'succeeded');assert.deepEqual(replay.result,{answer:'stored'});
  const failedArgs=['u1','op-handler-0002','payload-hash-2'];await beginOperation(...failedArgs,{store});await failOperation(...failedArgs,'upstream unavailable',store);
  const retry=await beginOperation(...failedArgs,{store});assert.equal(retry.state,'running');assert.equal(retry.attempt,2);
});

test('Firebase ID-token exchange reuses one opaque session ID and does not create duplicate sessions',async()=>{
  const store=new FakeFirestore(),token='test-firebase-id-token',data={user:{id:'google_123'},authProvider:'google'};
  const first=await exchangeFirebaseSessionOnce(token,data,store),second=await exchangeFirebaseSessionOnce(token,data,store);
  assert.equal(first,second);assert.equal([...store.rows.keys()].filter(k=>k.startsWith('browser_sessions/')).length,1);
});
