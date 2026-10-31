import {BYO_SERVICE_FEES} from './pricing.js';
export function resolveOperationPricing({route='',platformAmount,byoCandidateCount=0}={}){
  const path=String(route||''),workspace=path.startsWith('/api/creator/')||path==='/api/agent/chat'?'creator':'developer',byo=Number(byoCandidateCount)>0;
  const amount=byo?Math.max(1,Number(workspace==='creator'?BYO_SERVICE_FEES.creator:BYO_SERVICE_FEES.developer)):Number(platformAmount);
  if(!Number.isFinite(amount)||amount<1)throw new Error('Server operation pricing is invalid.');
  const taskKind=path.includes('/diagnose')?'diagnosis':path.includes('/repair/')?'repair':path.includes('/agent/chat')?'chat':path.includes('/creator/image')?'image':'workflow';
  return {amount,byo,workspace,taskKind};
}
