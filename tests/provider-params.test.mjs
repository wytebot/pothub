import test from 'node:test';
import assert from 'node:assert/strict';
import {openAiRequestParams} from '../server/provider-params.js';

test('reasoning models use max_completion_tokens and omit temperature/response_format',()=>{
  assert.deepEqual(openAiRequestParams({provider:'openai',model:'gpt-5.4',maxTokens:512,jsonMode:true}),{max_completion_tokens:512});
  assert.deepEqual(openAiRequestParams({provider:'openai',model:'o3',maxTokens:64,jsonMode:true}),{max_completion_tokens:64});
});
test('classic OpenAI models use max_tokens and supported JSON mode only',()=>{
  assert.deepEqual(openAiRequestParams({provider:'openai',model:'gpt-4.1',maxTokens:300,jsonMode:true}),{max_tokens:300,temperature:0.2,response_format:{type:'json_object'}});
  assert.deepEqual(openAiRequestParams({provider:'groq',model:'llama-3.3-70b-versatile',maxTokens:300,jsonMode:true}),{max_tokens:300,temperature:0.2});
});
