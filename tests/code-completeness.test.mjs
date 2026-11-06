import test from 'node:test';
import assert from 'node:assert/strict';
import {closeOpenFence,findCodeIssues,runCompleteChat,CONTINUE_PROMPT} from '../server/code-completeness.js';
import {readChatStream} from '../server/chat-stream.js';

test('closes a fence left open by a cut-off reply',()=>{
  assert.equal(closeOpenFence('```js\nconst a=1;'),'```js\nconst a=1;\n```');
  assert.equal(closeOpenFence('```js\nx\n```'),'```js\nx\n```');
});

test('finds invalid JSON, JS syntax errors and placeholders; leaves good code alone',()=>{
  assert.equal(findCodeIssues('```json\n{"a":1}\n```').length,0);
  assert.match(findCodeIssues('```json\n{"a":1,}\n```')[0].message,/invalid JSON/);
  assert.match(findCodeIssues('```js\nfunction f( {\n```')[0].message,/syntax error/);
  assert.equal(findCodeIssues('```js\nconst x = await fetch("/a");\nconsole.log(x)\n```').length,0);
  assert.equal(findCodeIssues('```js\nimport a from "a";\nexport const b = 1;\n```').length,0);
  assert.equal(findCodeIssues('```python\ndef f():\n    ...\n```').length,0);
  assert.equal(findCodeIssues('```js\nfunction a(){\n  // ... rest of the code unchanged\n}\n```')[0].kind,'placeholder');
});

test('continues a cut-off answer until complete, and closes the fence',async()=>{
  const out=[];let call=0;const seen=[];
  const full=await runCompleteChat({onToken:t=>out.push(t),runTurn:async({history,onToken})=>{
    seen.push(history.length);call++;
    const t=call===1?'```js\nconst a = 1;\n':call===2?'const b = 2;\n':'console.log(a+b);\n```';
    onToken(t);return {text:t,finish:call<3?'length':''};
  }});
  assert.equal(call,3);assert.equal(full,'```js\nconst a = 1;\nconst b = 2;\nconsole.log(a+b);\n```');
  assert.equal(out.join(''),full);assert.deepEqual(seen,[0,2,2]);
});

test('stops after the continuation limit with a visible note and a closed fence',async()=>{
  const full=await runCompleteChat({maxContinuations:1,onToken:()=>{},runTurn:async({onToken})=>{onToken('```js\nlet a;\n');return {text:'```js\nlet a;\n',finish:'length'}}});
  assert.match(full,/output or time limit/);assert.ok((full.match(/```/g)||[]).length%2===0);
});

test('halves the token limit when the provider rejects it, then succeeds',async()=>{
  const limits=[];
  const full=await runCompleteChat({maxTokens:8192,onToken:()=>{},runTurn:async({maxTokens,onToken})=>{limits.push(maxTokens);if(maxTokens>4096)throw Object.assign(new Error('max_tokens too large'),{tokenLimit:true});onToken('ok');return {text:'ok',finish:''}}});
  assert.equal(full,'ok');assert.deepEqual(limits,[8192,4096]);
});

test('runs one correction pass for broken code and appends the corrected version',async()=>{
  const prompts=[];
  const full=await runCompleteChat({onToken:()=>{},runTurn:async({history,onToken})=>{
    if(!history.length){const t='Here:\n```json\n{"a":1,}\n```';onToken(t);return {text:t,finish:''}}
    prompts.push(history.at(-1).text);const t='```json\n{"a":1}\n```';onToken(t);return {text:t,finish:''};
  }});
  assert.equal(prompts.length,1);assert.match(prompts[0],/invalid JSON/);
  assert.match(full,/Corrected version/);assert.ok(full.endsWith('```json\n{"a":1}\n```'));
});

test('a failed correction never loses the original answer',async()=>{
  const full=await runCompleteChat({onToken:()=>{},runTurn:async({history,onToken})=>{
    if(history.length)throw new Error('boom');const t='```json\n{bad}\n```';onToken(t);return {text:t,finish:''};
  }});
  assert.equal(full,'```json\n{bad}\n```');
});

test('an empty continuation counts as finished',async()=>{
  let n=0;
  const full=await runCompleteChat({onToken:()=>{},runTurn:async({onToken})=>{n++;if(n===1){onToken('Done.');return {text:'Done.',finish:'length'}}throw new Error('The configured model returned no text.')}});
  assert.ok(full.startsWith('Done.'));
});

test('stream readers report the length stop reason',async()=>{
  const sse=(...e)=>new Response(e.map(x=>`data: ${JSON.stringify(x)}\n\n`).join(''));
  let meta={};await readChatStream(sse({choices:[{delta:{content:'a'}}]},{choices:[{delta:{},finish_reason:'length'}]}),'openai',()=>{},meta);assert.equal(meta.finish,'length');
  meta={};await readChatStream(sse({type:'content_block_delta',delta:{text:'a'}},{type:'message_delta',delta:{stop_reason:'max_tokens'}}),'anthropic',()=>{},meta);assert.equal(meta.finish,'length');
  meta={};await readChatStream(sse({choices:[{delta:{content:'a'}}]},{choices:[{delta:{},finish_reason:'stop'}]}),'openai',()=>{},meta);assert.equal(meta.finish,undefined);
  assert.ok(CONTINUE_PROMPT.length>20);
});

import fs from 'node:fs';
test('streamed chat is routed through the completion runner with a time budget', () => {
  const app = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
  assert.match(app, /return runCompleteChat\(\{signal,onToken,deadlineAt/);
  assert.match(app, /CODE_COMPLETENESS_RULES/);
  assert.match(app, /AI_CHAT_STREAM_BUDGET_MS/);
  assert.match(app, /maxTokens,onToken:track|onToken:track,signal:budgetSignal\(\)/);
});
