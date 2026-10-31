import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createServer} from 'node:http';
import app from '../server/app.js';

test('real Flutterwave webhook handler rejects forged signatures and stale signed replays',async t=>{
  process.env.FLW_WEBHOOK_SECRET_HASH='test-webhook-secret';
  const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,body={event:'charge.completed',timestamp:Math.floor(Date.now()/1000),data:{id:'123',tx_ref:'ref_123456'}};
  const raw=JSON.stringify(body);
  const forged=await fetch(base+'/api/webhooks/flutterwave',{method:'POST',headers:{'Content-Type':'application/json','flutterwave-signature':'not-a-signature'},body:raw});
  assert.equal(forged.status,401);
  const staleBody={...body,timestamp:Math.floor(Date.now()/1000)-900},staleRaw=JSON.stringify(staleBody),signature=crypto.createHmac('sha256','test-webhook-secret').update(Buffer.from(staleRaw)).digest('base64');
  const replay=await fetch(base+'/api/webhooks/flutterwave',{method:'POST',headers:{'Content-Type':'application/json','flutterwave-signature':signature},body:staleRaw});
  assert.equal(replay.status,401);
});
