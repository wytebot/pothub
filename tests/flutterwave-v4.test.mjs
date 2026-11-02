import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {encryptCardField,generateNonce,normalizeCard,luhnValid,buildPaymentMethodBody,buildCustomerBody,buildChargeBody,nextActionOf,parsePhone} from '../server/flutterwave-v4.js';

const KEY=crypto.randomBytes(32).toString('base64');

test('card fields are AES-256-GCM encrypted and decryptable with the same key and nonce',()=>{
  const nonce=generateNonce();assert.equal(nonce.length,12);
  const out=Buffer.from(encryptCardField('4242424242424242',nonce,KEY),'base64');
  const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(KEY,'base64'),Buffer.from(nonce));
  d.setAuthTag(out.subarray(out.length-16));
  assert.equal(Buffer.concat([d.update(out.subarray(0,out.length-16)),d.final()]).toString(),'4242424242424242');
});
test('encryption key must be 32 bytes and nonce 12 chars',()=>{
  assert.throws(()=>encryptCardField('1',generateNonce(),'short'),/32-byte/);
  assert.throws(()=>encryptCardField('1','abc',KEY),/12 characters/);
});
test('card validation',()=>{
  assert.equal(luhnValid('4242424242424242'),true);assert.equal(luhnValid('4242424242424241'),false);
  const ok=normalizeCard({number:'4242 4242 4242 4242',expiryMonth:'9',expiryYear:'2099',cvv:'123'});
  assert.deepEqual(ok,{number:'4242424242424242',month:'09',year:'99',cvv:'123'});
  assert.throws(()=>normalizeCard({...ok,number:'1234567890123456',expiryMonth:'09',expiryYear:'99'}),/valid card number/);
  assert.throws(()=>normalizeCard({number:'4242424242424242',expiryMonth:'01',expiryYear:'20',cvv:'123'}),/expired/);
  assert.throws(()=>normalizeCard({number:'4242424242424242',expiryMonth:'12',expiryYear:'99',cvv:'1'}),/security code/);
});
test('payment-method body never contains plaintext card data',()=>{
  const body=buildPaymentMethodBody({number:'4242424242424242',month:'09',year:'99',cvv:'123'},KEY);
  const json=JSON.stringify(body);
  assert.equal(body.type,'card');assert.ok(!json.includes('4242424242424242'));assert.equal(body.card.nonce.length,12);
});
test('customer, charge and next-action shapes',()=>{
  assert.deepEqual(buildCustomerBody({email:' A@B.com ',name:'Ada Lovelace King',phone:'+2348012345678'}),{email:'a@b.com',name:{first:'Ada',last:'Lovelace King'},phone:{country_code:'234',number:'8012345678'}});
  assert.equal(buildCustomerBody({email:'a@b.com',name:'Ada',phone:'0801'}).phone,undefined);
  assert.equal(parsePhone('+14155550123').country_code,'1');
  const c=buildChargeBody({order:{reference:'kh1',amount:9.99,currency:'usd',pack_id:'p'},customerId:'cus',paymentMethodId:'pm',redirectUrl:'https://x/y'});
  assert.equal(c.currency,'USD');assert.equal(c.amount,9.99);assert.equal(c.customer_id,'cus');
  assert.equal(nextActionOf({status:'succeeded'}).type,'none');
  assert.equal(nextActionOf({status:'failed'}).type,'failed');
  assert.equal(nextActionOf({status:'pending',next_action:{type:'redirect_url',redirect_url:{url:'https://bank.example/3ds'}}}).url,'https://bank.example/3ds');
  assert.equal(nextActionOf({status:'pending',next_action:{type:'redirect_url',redirect_url:{url:'http://insecure'}}}).type,'unsupported');
  assert.equal(nextActionOf({status:'pending',next_action:{type:'requires_pin'}}).type,'unsupported');
});
