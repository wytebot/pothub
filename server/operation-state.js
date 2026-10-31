/** Pure state transition used inside Firestore transactions. */
export function decideOperation(existing,{userId,operationId,payloadHash,now=Date.now(),ttlMs=20*60*1000}={}){
  if(existing){
    if(String(existing.userId)!==String(userId)||String(existing.payloadHash)!==String(payloadHash)){
      const error=new Error('This operation ID was already used with a different payload.');error.status=409;error.code='IDEMPOTENCY_PAYLOAD_MISMATCH';throw error;
    }
    if(existing.state==='succeeded')return {action:'return',state:'succeeded',result:existing.result};
    const expires=typeof existing.expiresAt?.toMillis==='function'?existing.expiresAt.toMillis():existing.expiresAt instanceof Date?existing.expiresAt.getTime():Number(existing.expiresAt||0);
    if(existing.state==='running'&&expires>now){const error=new Error('This operation is already running. Retry shortly with the same operation ID.');error.status=409;error.code='OPERATION_IN_PROGRESS';throw error;}
    return {action:'retry',state:'running',attempt:Number(existing.attempt||1)+1,record:{state:'running',attempt:Number(existing.attempt||1)+1,updatedAt:new Date(now),expiresAt:new Date(now+ttlMs)}};
  }
  return {action:'create',state:'running',attempt:1,record:{userId:String(userId),operationId:String(operationId),payloadHash:String(payloadHash),state:'running',attempt:1,createdAt:new Date(now),updatedAt:new Date(now),expiresAt:new Date(now+ttlMs)}};
}
