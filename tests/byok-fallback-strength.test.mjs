import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackSequence, interleaveAgentCandidates } from '../src/lib/agent-routing.js';

test('fallback sequence prefers configured task agents and round-robins their saved models',()=>{
 const primary=[{key:'k1',provider:'gemini',models:['flash','pro']},{key:'k2',provider:'openai',models:['mini']}];
 const extra=[{key:'k3',provider:'anthropic',models:['sonnet']},{key:'k1',provider:'gemini',models:['flash']}];
 assert.deepEqual(buildFallbackSequence(primary,extra,8).map(x=>`${x.key}:${x.model}`),['k1:flash','k2:mini','k1:pro','k3:sonnet']);
});
test('fallback candidates are bounded and every model remains paired with its saved provider, key, endpoint and task',()=>{
 const input=[{key:'one',provider:'gemini',baseUrl:'https://a.example',task:'chat',models:['m1','m2']},{key:'two',provider:'openai',baseUrl:'https://b.example',task:'image',models:['m3']}];
 const out=interleaveAgentCandidates(input,2);
 assert.equal(out.length,2);assert.deepEqual(out.map(x=>[x.key,x.provider,x.baseUrl,x.task]),[['one','gemini','https://a.example','chat'],['two','openai','https://b.example','image']]);
 assert.ok(out.every(x=>input.some(a=>a.key===x.key&&a.provider===x.provider&&a.models.includes(x.model))));
});
test('fallback rejects missing keys/providers/models instead of inventing a platform candidate',()=>{
 assert.deepEqual(interleaveAgentCandidates([{key:'',provider:'gemini',models:['m1']},{key:'k',provider:'',models:['m2']},{key:'k',provider:'gemini',models:[]}]),[]);
 assert.deepEqual(buildFallbackSequence([],[],8),[]);
});
