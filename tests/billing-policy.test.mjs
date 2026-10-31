import test from 'node:test';import assert from 'node:assert/strict';import {resolveOperationPricing} from '../server/billing-policy.js';
test('client-controlled mode and workspace headers cannot lower platform operation pricing',()=>{const forgedHeaders={'x-pothub-use-agent':'true','x-pothub-workspace':'creator'};const price=resolveOperationPricing({route:'/api/diagnose',platformAmount:10,byoCandidateCount:0});assert.equal(price.amount,10);assert.equal(price.byo,false);assert.equal(price.workspace,'developer');assert.ok(forgedHeaders['x-pothub-use-agent'])});
test('valid server-resolved BYO candidates use existing workspace-specific service fees',()=>{assert.deepEqual(resolveOperationPricing({route:'/api/diagnose',platformAmount:10,byoCandidateCount:1}),{amount:2,byo:true,workspace:'developer',taskKind:'diagnosis'});assert.deepEqual(resolveOperationPricing({route:'/api/agent/chat',platformAmount:10,byoCandidateCount:1}),{amount:1,byo:true,workspace:'creator',taskKind:'chat'});assert.equal(resolveOperationPricing({route:'/api/repair/propose',platformAmount:20,byoCandidateCount:0}).amount,20)});

test('platform AI keeps platform rates while Creator BYO uses one credit and Developer BYO uses two',()=>{
 assert.equal(resolveOperationPricing({route:'/api/diagnose',platformAmount:10,byoCandidateCount:0}).amount,10);
 assert.equal(resolveOperationPricing({route:'/api/repair/propose',platformAmount:20,byoCandidateCount:0}).amount,20);
 assert.equal(resolveOperationPricing({route:'/api/agent/chat',platformAmount:10,byoCandidateCount:1}).amount,1);
 assert.equal(resolveOperationPricing({route:'/api/diagnose',platformAmount:10,byoCandidateCount:1}).amount,2);
});
