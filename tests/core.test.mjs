import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, calculatePack, OPERATIONS } from '../server/pricing.js';
import { validateRepoName, parseCsv } from './helpers.js';
import { isVerifiedPayment, isValidWebhookSecret, isFreshWebhookTimestamp, grantDocumentId } from '../server/billing-safety.js';
import { boundPrompt, parseModelJson } from '../server/ai-safety.js';

test('repo names reject traversal and invalid GitHub names',()=>{assert.equal(validateRepoName('my-repo'),true);assert.equal(validateRepoName('../repo'),false);assert.equal(validateRepoName('has space'),false)});
test('CSV parser handles quoted commas and escaped quotes',()=>{assert.deepEqual(parseCsv('name,note\nA,"hello, world"\nB,"say ""hi"""'),[['name','note'],['A','hello, world'],['B','say "hi"']])});
test('pricing packs preserve public prices, revised credit counts and operation costs',()=>{assert.deepEqual(PACKS.map(p=>[p.usd,p.credits]),[[1.99,24],[4.99,74],[9.99,158],[19.99,324]]);assert.deepEqual(OPERATIONS,{diagnosis:10,repair:20});assert.ok(PACKS.every(p=>calculatePack(p).passesTarget))});

test('prompt bounding function enforces configured limits',()=>{const input='x'.repeat(30000);assert.equal(boundPrompt(input,25000).length,25000);assert.equal(boundPrompt('abc',25000),'abc')});
test('model JSON parser handles fenced JSON and rejects malformed output',()=>{assert.deepEqual(parseModelJson('```json\n{\"ok\":true}\n```'),{ok:true});assert.throws(()=>parseModelJson('not json'));assert.deepEqual(parseModelJson('[1,2]'),[1,2]);assert.deepEqual(parseModelJson('{"items":[1,2'),{items:[1,2]})});


test('payment verification rejects wrong amount, currency, reference and charge ID',()=>{
  const order={reference:'pothub_ref_12345',provider_charge_id:'charge_123',amount:4.99,currency:'USD'};
  const charge={reference:order.reference,id:order.provider_charge_id,amount:4.99,currency:'usd',status:'succeeded'};
  assert.equal(isVerifiedPayment(order,charge),true);
  assert.equal(isVerifiedPayment(order,{...charge,amount:1}),false);
  assert.equal(isVerifiedPayment(order,{...charge,currency:'NGN'}),false);
  assert.equal(isVerifiedPayment(order,{...charge,reference:'other'}),false);
  assert.equal(isVerifiedPayment(order,{...charge,id:'other'}),false);
  assert.equal(isVerifiedPayment({...order,provider_charge_id:''},charge),false);
});

test('webhook shared-secret check rejects missing and mismatched values',async()=>{
  const {createHmac}=await import('node:crypto');const body=Buffer.from('{"timestamp":1793400000000}');const sig=createHmac('sha256','configured-secret').update(body).digest('base64');
  assert.equal(isValidWebhookSecret('configured-secret',sig,body),true);
  assert.equal(isValidWebhookSecret('configured-secret','wrong-secret',body),false);
  assert.equal(isValidWebhookSecret('configured-secret','',body),false);
  assert.equal(isValidWebhookSecret('','configured-secret',body),false);
  assert.equal(isFreshWebhookTimestamp(1000000,1000000000),true);assert.equal(isFreshWebhookTimestamp(1,1000000),false);
});

test('credit grant marker is stable per user and reference and separated by user',()=>{
  assert.equal(grantDocumentId('user-1','order-1'),grantDocumentId('user-1','order-1'));
  assert.notEqual(grantDocumentId('user-1','order-1'),grantDocumentId('user-2','order-1'));
  assert.notEqual(grantDocumentId('user-1','order-1'),grantDocumentId('user-1','order-2'));
  assert.throws(()=>grantDocumentId('','order-1'));
});

test('model JSON parser handles trailing prose and truncated closing braces',()=>{
  assert.deepEqual(parseModelJson('Here is the result:\n```json\n{"ok":true,"items":[1,2]}\n```\nDone.'),{ok:true,items:[1,2]});
  assert.deepEqual(parseModelJson('{"ok":true,"meta":{"ready":true}'),{ok:true,meta:{ready:true}});
  assert.throws(()=>parseModelJson('{"ok": "unfinished'));
});

test('prompt bounding preserves both the first and last context rather than truncating the failure',()=>{
  const input='EARLY_CONTEXT '+('x'.repeat(30000))+' CRITICAL_ERROR_AT_END';
  const out=boundPrompt(input,12000);
  assert.ok(out.length<=12000);assert.match(out,/EARLY_CONTEXT/);assert.match(out,/CRITICAL_ERROR_AT_END/);
});
