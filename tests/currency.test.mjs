import test from 'node:test';
import assert from 'node:assert/strict';
import {usdNgnRate,usdToNgn} from '../server/currency.js';

test('USD to NGN conversion uses a bounded configured rate or the documented fallback',()=>{
  assert.equal(usdNgnRate({POTHUB_USD_NGN_RATE:'1500'}),1500);
  assert.equal(usdNgnRate({POTHUB_USD_NGN_RATE:'not-a-rate'}),1347);
  assert.equal(usdNgnRate({POTHUB_USD_NGN_RATE:'12'}),1347);
  assert.equal(usdToNgn(1.99,1347),2681);
  assert.equal(usdToNgn(4.99,1347),6722);
});
test('invalid currency values are rejected rather than displayed as NaN',()=>{
  assert.throws(()=>usdToNgn(-1,1347));
  assert.throws(()=>usdToNgn(2,0));
});
