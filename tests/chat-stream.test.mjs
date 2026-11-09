import test from 'node:test';
import assert from 'node:assert/strict';
import {readChatStream,providerErrorDetail,partsText} from '../server/chat-stream.js';

const sse=(...events)=>new Response(events.map(e=>`data: ${typeof e==='string'?e:JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
const run=async(res,kind)=>{const t=[];const full=await readChatStream(res,kind,x=>t.push(x));return {full,t}};

test('OpenAI-style SSE (OpenAI, Groq, Mistral, DeepSeek, xAI, OpenRouter, custom/Vercel backend)',async()=>{
  const {full,t}=await run(sse({choices:[{delta:{role:'assistant',content:''}}]},{choices:[{delta:{content:'Hel'}}]},{choices:[{delta:{content:'lo'}}]},'[DONE]'),'openai');
  assert.equal(full,'Hello');assert.deepEqual(t,['Hel','lo']);
});
test('reasoning deltas without content are skipped, content kept',async()=>{
  const {full}=await run(sse({choices:[{delta:{reasoning_content:'thinking'}}]},{choices:[{delta:{content:'Answer'}}]}),'openai');
  assert.equal(full,'Answer');
});
test('content delivered as parts arrays',async()=>{
  const {full}=await run(sse({choices:[{delta:{content:[{type:'text',text:'Part A'},{type:'text',text:' B'}]}}]}),'openai');
  assert.equal(full,'Part A B');
});
test('endpoints that ignore stream:true and return one JSON document still work',async()=>{
  const res=new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'Whole reply'}}]}),{headers:{'content-type':'application/json'}});
  const {full,t}=await run(res,'openai');assert.equal(full,'Whole reply');assert.deepEqual(t,['Whole reply']);
});
test('Anthropic-style SSE and single JSON',async()=>{
  const {full}=await run(sse({type:'message_start'},{type:'content_block_delta',delta:{type:'text_delta',text:'Hi '}},{type:'content_block_delta',delta:{type:'text_delta',text:'there'}},{type:'message_stop'}),'anthropic');
  assert.equal(full,'Hi there');
  const one=await run(new Response(JSON.stringify({content:[{type:'text',text:'Complete'}]})),'anthropic');assert.equal(one.full,'Complete');
});
test('in-stream and JSON errors are reported with their reason',async()=>{
  await assert.rejects(run(sse({error:{message:'Rate limit exceeded for model'}}),'openai'),/Rate limit exceeded/);
  await assert.rejects(run(sse({type:'error',error:{type:'overloaded_error',message:'Overloaded'}}),'anthropic'),/Overloaded/);
  await assert.rejects(run(new Response(JSON.stringify({error:{message:'model not found'}})),'openai'),/model not found/);
});
test('empty replies fail clearly',async()=>{
  await assert.rejects(run(sse('[DONE]'),'openai'),/returned no text/);
});
test('HTTP failures expose a readable, redacted reason',async()=>{
  const res=new Response(JSON.stringify({error:{message:'Incorrect API key provided: sk-abcdefghijklmnopqrstuvwxyz123456'}}),{status:401});
  const d=await providerErrorDetail(res);assert.match(d,/Incorrect API key/);assert.ok(!d.includes('sk-abcdefghijklmnopqrstuvwxyz123456'));
  assert.equal(partsText(undefined),'');
});
