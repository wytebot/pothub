import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackSequence, interleaveAgentCandidates } from '../src/lib/agent-routing.js';
import { classifyRequest } from '../src/lib/request-intent.js';

test('BYOK fallback contains only explicitly configured agents and their models',()=>{
 const configured=[{key:'user-key-a',provider:'gemini',models:['model-a','model-b'],task:'chat'},{key:'user-key-b',provider:'openai',models:['model-c'],task:'chat'}];
 const result=buildFallbackSequence(configured,[],8);
 assert.deepEqual(result.map(x=>x.key),['user-key-a','user-key-b','user-key-a']);
 assert.ok(result.every(x=>configured.some(a=>a.key===x.key&&a.provider===x.provider&&a.models.includes(x.model))));
});
test('empty or invalid saved agent configuration produces no fallback candidate',()=>{
 assert.deepEqual(buildFallbackSequence([],[],8),[]);
 assert.deepEqual(interleaveAgentCandidates([{key:'',provider:'gemini',models:['active-model']}]),[]);
});
test('intent routing distinguishes media creation from code and analysis before choosing an agent function',()=>{
 assert.equal(classifyRequest('Generate an image of a red bicycle').task,'image');
 assert.equal(classifyRequest('Create a video of ocean waves').task,'video');
 assert.equal(classifyRequest('Write Python code to resize an image').task,'chat');
 assert.equal(classifyRequest('Explain video codecs').task,'chat');
});
