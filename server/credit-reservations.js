export async function reserveCreditReservation(client,userId,amount,reference,reason='AI operation',metadata={}){
  const {data,error}=await client.rpc('reserve_credits',{p_github_id:String(userId),p_amount:amount,p_reference:String(reference),p_reason:reason,p_metadata:metadata});
  if(error)throw new Error(error.message||'Unable to reserve credits.');if(!data?.ok)throw new Error(data?.message||'Not enough credits.');
  return {credits:Number(data.credits),duplicate:!!data.duplicate,state:data.state,reservationId:data.reservationId,result:data.result||null,demo:false};
}
export async function commitCreditReservation(client,userId,reference,result=null){const {data,error}=await client.rpc('commit_credit_reservation',{p_github_id:String(userId),p_reference:String(reference),p_result:result});if(error||!data?.ok)throw new Error(error?.message||data?.message||'Unable to commit credit reservation.');return data}
export async function releaseCreditReservation(client,userId,reference){const {data,error}=await client.rpc('release_credit_reservation',{p_github_id:String(userId),p_reference:String(reference)});if(error||!data?.ok)throw new Error(error?.message||data?.message||'Unable to release credit reservation.');return data}

export async function grantCreditsOnce(client,userId,amount,reference,reason='Credit purchase'){const {data,error}=await client.rpc('grant_credits',{p_github_id:String(userId),p_amount:amount,p_reference:String(reference),p_reason:reason});if(error)throw new Error(error.message||'Unable to grant credits.');if(!data?.ok)throw new Error(data?.message||'Unable to grant credits.');return data}
