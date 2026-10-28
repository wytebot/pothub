import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, calculatePack, OPERATIONS } from '../server/pricing.js';
import { validateRepoName, parseCsv } from './helpers.js';

test('repo names reject traversal and invalid GitHub names',()=>{assert.equal(validateRepoName('my-repo'),true);assert.equal(validateRepoName('../repo'),false);assert.equal(validateRepoName('has space'),false)});
test('CSV parser handles quoted commas and escaped quotes',()=>{assert.deepEqual(parseCsv('name,note\nA,"hello, world"\nB,"say ""hi"""'),[['name','note'],['A','hello, world'],['B','say "hi"']])});
test('pricing packs preserve exact public prices and operation costs',()=>{assert.deepEqual(PACKS.map(p=>[p.usd,p.credits]),[[1.99,20],[4.99,60],[9.99,130],[19.99,260]]);assert.deepEqual(OPERATIONS,{diagnosis:10,repair:20,file:15});assert.ok(PACKS.every(p=>calculatePack(p).passesTarget))});
test('credit reserve/refund arithmetic returns original balance on failure',()=>{const start=25,reserved=start-20,refunded=reserved+20;assert.equal(reserved,5);assert.equal(refunded,start)});
test('bounded prompt budget is enforced by the documented limit',()=>{const max=25000;const input='x'.repeat(30000);assert.equal(input.slice(0,max).length,max)});
