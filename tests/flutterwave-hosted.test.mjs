import test from 'node:test';
import assert from 'node:assert/strict';
import {isVerifiedHostedPayment,hostedFlutterwaveRequest} from '../server/flutterwave-hosted.js';

test('hosted checkout verification binds transaction ID, reference, amount, currency and successful status',()=>{
  const order={reference:'kh123456',amount:9.99,currency:'USD'};
  const good={id:123,status:'successful',tx_ref:'kh123456',amount:10,currency:'USD'};
  assert.equal(isVerifiedHostedPayment(order,good,'123'),true);
  for(const bad of [{...good,id:124},{...good,tx_ref:'other'},{...good,amount:9},{...good,currency:'NGN'},{...good,status:'pending'}])assert.equal(isVerifiedHostedPayment(order,bad,'123'),false);
});

test('hosted checkout HTTP client pins the official v3 origin and keeps secret in server Authorization header',async()=>{
  let call;
  const result=await hostedFlutterwaveRequest('/payments',{
    secret:'server-secret-key-which-is-long-enough',method:'POST',body:{tx_ref:'ref'},
    fetchImpl:async(url,options)=>{
      call={url,options};
      return {ok:true,status:200,json:async()=>({status:'success',data:{link:'https://checkout.flutterwave.com/v3/hosted/pay/abc'}})};
    }
  });
  assert.equal(call.url,'https://api.flutterwave.com/v3/payments');
  assert.equal(call.options.headers.Authorization,'Bearer server-secret-key-which-is-long-enough');
  assert.equal(JSON.parse(call.options.body).tx_ref,'ref');
  assert.equal(result.data.link,'https://checkout.flutterwave.com/v3/hosted/pay/abc');
});
