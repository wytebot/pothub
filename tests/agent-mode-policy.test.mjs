import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseOperationAgents,normalizeDeveloperAgentMode} from '../server/agent-mode-policy.js';

test('Developer AI mode defaults safely to Pothub AI and ignores supplied BYO candidates',()=>{
  assert.equal(normalizeDeveloperAgentMode(undefined),'pothub');
  assert.deepEqual(chooseOperationAgents({workspace:'developer',mode:'pothub',candidates:[{key:'secret'}]}),{mode:'pothub',candidates:[]});
});
test('Developer own-agent mode requires a task-compatible configured agent',()=>{
  assert.throws(()=>chooseOperationAgents({workspace:'developer',mode:'own',candidates:[]}),e=>e.code==='AGENT_NOT_CONFIGURED'&&e.status===409);
  const candidate={key:'secret',task:'diagnosis'};
  assert.deepEqual(chooseOperationAgents({workspace:'developer',mode:'own',candidates:[candidate]}),{mode:'own',candidates:[candidate]});
});
test('Creator uses a configured agent automatically and uses platform mode only when none is supplied',()=>{
  assert.equal(chooseOperationAgents({workspace:'creator',candidates:[{key:'secret'}]}).mode,'own');
  assert.equal(chooseOperationAgents({workspace:'creator',candidates:[]}).mode,'pothub');
});
