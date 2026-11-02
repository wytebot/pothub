import test from 'node:test';
import assert from 'node:assert/strict';
import {providerHealthKey,providerAvailable,recordProviderSuccess,recordProviderFailure,providerHealthSnapshot,resetProviderHealth} from '../server/provider-health.js';
test('provider circuit opens after consecutive failures and recovers after cooldown',()=>{
 resetProviderHealth();const key=providerHealthKey('openai','gpt-test');assert.equal(providerAvailable(key,1000),true);recordProviderFailure(key,1000);assert.equal(providerAvailable(key,1001),true);recordProviderFailure(key,1002);assert.equal(providerAvailable(key,1003),false);assert.equal(providerAvailable(key,61003),true);recordProviderSuccess(key,25,61004);assert.equal(providerHealthSnapshot()[0].failures,0);assert.equal(providerAvailable(key,61005),true);
});
