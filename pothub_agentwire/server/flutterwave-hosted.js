export async function hostedFlutterwaveRequest(path,{secret,method='GET',body,fetchImpl=globalThis.fetch,timeoutMs=18000}={}){
  const key=String(secret||'');if(key.length<20)throw new Error('Hosted Flutterwave checkout is not configured. Set FLW_SECRET_KEY.');
  const safePath=String(path||'');if(!safePath.startsWith('/')||safePath.startsWith('//'))throw new Error('Flutterwave API path is invalid.');
  const response=await fetchImpl(`https://api.flutterwave.com/v3${safePath}`,{method,signal:AbortSignal.timeout(timeoutMs),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.message||data.error||`Flutterwave hosted checkout returned HTTP ${response.status}`),{status:502});return data;
}
export function isVerifiedHostedPayment(order,transaction,expectedId=''){
  const id=String(transaction?.id??'');
  return String(transaction?.status||'').toLowerCase()==='successful'
    && String(transaction?.tx_ref||'')===String(order?.reference||'')
    && String(transaction?.currency||'').toUpperCase()===String(order?.currency||'').toUpperCase()
    && Number.isFinite(Number(transaction?.amount))&&Number(transaction.amount)>=Number(order?.amount)
    && (!expectedId||id===String(expectedId));
}
