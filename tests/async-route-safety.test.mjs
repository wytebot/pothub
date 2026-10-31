import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import app from '../server/app.js';

test('real Express body-parser errors reach the shared JSON error handler',async t=>{
  const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/diagnose`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'capacitor://localhost'},body:'{'});
  assert.equal(response.status,400);const data=await response.json();assert.ok(data.error);assert.ok(data.code);assert.ok(data.requestId);
});
