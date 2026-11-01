/** BYOK provider inference is paid by the user to their provider. Discovery/configuration are free; one credit is reserved for each successful BYOK agent workflow. */
export function resolveOperationPricing({route='',platformAmount,byoCandidateCount=0}={}){
  const path=String(route||''),workspace=path.startsWith('/api/creator/')||path==='/api/agent/chat'?'creator':'developer',byo=Number(byoCandidateCount)>0;
  const taskKind=path.includes('/agent/models')?'model-discovery':path.includes('/diagnose')?'diagnosis':path.includes('/repair/')?'repair':path.includes('/agent/chat')?'chat':path.includes('/creator/image')?'image':'workflow';
  if(taskKind==='model-discovery')return {amount:0,byo,workspace,taskKind};
  const amount=byo?1:Number(platformAmount);
  if(!Number.isFinite(amount)||amount<1)throw new Error('Server operation pricing is invalid.');
  return {amount,byo,workspace,taskKind};
}
