import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseOperationAgents,normalizeDeveloperAgentMode} from '../server/agent-mode-policy.js';
test('BYOK is mandatory and legacy platform mode is normalized away',()=>{
 assert.equal(normalizeDeveloperAgentMode(undefined),'own');
 assert.equal(normalizeDeveloperAgentMode('pothub'),'own');
});
test('All workspaces require at least one configured BYOK agent',()=>{
 assert.throws(()=>chooseOperationAgents({workspace:'developer',candidates:[]}),e=>e.code==='AGENT_NOT_CONFIGURED'&&e.status===409);
 assert.throws(()=>chooseOperationAgents({workspace:'creator',candidates:[]}),e=>e.code==='AGENT_NOT_CONFIGURED');
 const candidate={key:'secret',task:'chat'};
 assert.deepEqual(chooseOperationAgents({workspace:'developer',candidates:[candidate]}),{mode:'own',candidates:[candidate]});
});
