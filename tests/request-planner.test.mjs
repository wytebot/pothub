import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequestIntent, planConfiguredAgents } from '../src/lib/request-planner.js';
test('planner classifies explicit image, video, file, and code intent together',()=>{
 assert.deepEqual(classifyRequestIntent({prompt:'Build a landing page, generate an image, make a video and export as zip'}).sort(),['code','file','image','text','video'].sort());
});
test('planner classifies attached image as vision input, not image generation',()=>{
 assert.deepEqual(classifyRequestIntent({prompt:'What is in this picture?',attachments:[{name:'cat.png',type:'image/png'}]}).sort(),['text','vision-input'].sort());
});
test('planner refuses to plan without exact task, scope, key, and verified capability',()=>{
 const caps=['image'];
 assert.deepEqual(planConfiguredAgents(caps,[{id:'a',provider:'gemini',model:'m',task:'chat',keyPresent:true,capabilities:['image'],modelVerified:true,workspace:'developer'}],'developer').missing,['image']);
 assert.deepEqual(planConfiguredAgents(caps,[{id:'a',provider:'gemini',model:'m',task:'image',keyPresent:true,capabilities:['image'],modelVerified:true,workspace:'developer'}],'creator').missing,['image']);
});
test('planner resolves only a task- and workspace-matched verified agent',()=>{
 const plan=planConfiguredAgents(['image'],[{id:'img1',provider:'replicate',model:'flux',task:'image',keyPresent:true,capabilities:['image'],modelVerified:true,workspace:'creator'}],'creator');
 assert.equal(plan.ready,true);assert.equal(plan.steps[0].agentId,'img1');
});

test('plain-language draw request is classified as image output',()=>{
 assert.deepEqual(classifyRequestIntent({prompt:'draw a cat astronaut'}),['image']);
});
test('video generation intent is not confused with text-only chat',()=>{
 assert.ok(classifyRequestIntent({prompt:'make a short video of a rocket launching'}).includes('video'));
});

