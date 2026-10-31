import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import app from '../server/app.js';

test('real Express handler returns native Capacitor CORS preflight for every API route group',async t=>{
  const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const routes=['/api/auth/me','/api/auth/device-seed','/api/auth/firebase-exchange','/api/auth/github','/api/auth/github/callback','/api/github/repos','/api/vercel/projects','/api/health','/api/billing/checkout','/api/billing/verify','/api/diagnose','/api/repair/propose','/api/creator/image','/api/agent/chat','/api/video/submit','/api/video/status','/api/video/result'];
  for(const path of routes){const response=await fetch(base+path,{method:'OPTIONS',headers:{Origin:'capacitor://localhost','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type,idempotency-key'}});assert.equal(response.status,204,path);assert.equal(response.headers.get('access-control-allow-origin'),'capacitor://localhost',path);assert.match(response.headers.get('access-control-allow-methods')||'',/POST/);assert.match(response.headers.get('access-control-allow-headers')||'',/Authorization/i);}
});
