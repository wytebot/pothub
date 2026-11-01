import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import app from '../server/app.js';

test('real health handler returns JSON diagnostics without exposing raw Firebase exceptions',async t=>{
  const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/health`,{headers:{Origin:'capacitor://localhost'}});
  assert.ok([200,503].includes(response.status));const body=await response.json();assert.equal(typeof body,'object');assert.ok(body.checks||body.error);assert.doesNotMatch(JSON.stringify(body),/private_key|client_secret|BEGIN PRIVATE KEY/);
});
