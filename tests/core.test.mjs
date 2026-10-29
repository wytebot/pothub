import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, calculatePack, OPERATIONS } from '../server/pricing.js';
import { validateRepoName, parseCsv } from './helpers.js';
import { isVerifiedPayment, isValidWebhookSecret, grantDocumentId } from '../server/billing-safety.js';
import { boundPrompt, parseModelJson } from '../server/ai-safety.js';

test('repo names reject traversal and invalid GitHub names',()=>{assert.equal(validateRepoName('my-repo'),true);assert.equal(validateRepoName('../repo'),false);assert.equal(validateRepoName('has space'),false)});
test('CSV parser handles quoted commas and escaped quotes',()=>{assert.deepEqual(parseCsv('name,note\nA,"hello, world"\nB,"say ""hi"""'),[['name','note'],['A','hello, world'],['B','say "hi"']])});
test('pricing packs preserve public prices, revised credit counts and operation costs',()=>{assert.deepEqual(PACKS.map(p=>[p.usd,p.credits]),[[1.99,24],[4.99,74],[9.99,158],[19.99,324]]);assert.deepEqual(OPERATIONS,{diagnosis:10,repair:20,file:15});assert.ok(PACKS.every(p=>calculatePack(p).passesTarget))});

test('prompt bounding function enforces configured limits',()=>{const input='x'.repeat(30000);assert.equal(boundPrompt(input,25000).length,25000);assert.equal(boundPrompt('abc',25000),'abc')});
test('model JSON parser handles fenced JSON and rejects malformed output',()=>{assert.deepEqual(parseModelJson('```json\n{\"ok\":true}\n```'),{ok:true});assert.throws(()=>parseModelJson('not json'));assert.throws(()=>parseModelJson('[1,2]'))});


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

test('webhook shared-secret check rejects missing and mismatched values',()=>{
  assert.equal(isValidWebhookSecret('configured-secret','configured-secret'),true);
  assert.equal(isValidWebhookSecret('configured-secret','wrong-secret'),false);
  assert.equal(isValidWebhookSecret('configured-secret',''),false);
  assert.equal(isValidWebhookSecret('','configured-secret'),false);
});

test('credit grant marker is stable per user and reference and separated by user',()=>{
  assert.equal(grantDocumentId('user-1','order-1'),grantDocumentId('user-1','order-1'));
  assert.notEqual(grantDocumentId('user-1','order-1'),grantDocumentId('user-2','order-1'));
  assert.notEqual(grantDocumentId('user-1','order-1'),grantDocumentId('user-1','order-2'));
  assert.throws(()=>grantDocumentId('','order-1'));
});
