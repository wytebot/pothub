import crypto from 'node:crypto';
const STATES=new Set(['queued','running','waiting','succeeded','failed','cancelled']);
export const jobId=()=>crypto.randomUUID();
export function normalizeJobPatch(patch,now=Date.now()){
  const state=String(patch?.state||'');if(!STATES.has(state))throw new Error('Invalid job state.');
  const progress=patch.progress===undefined?undefined:Math.max(0,Math.min(100,Math.round(Number(patch.progress)||0)));
  const out={state,updatedAt:now};if(progress!==undefined)out.progress=progress;
  for(const k of ['stage','message','result','errorCode','cancelRequested'])if(patch[k]!==undefined)out[k]=patch[k];
  if(state==='succeeded'||state==='failed'||state==='cancelled')out.finishedAt=now;return out;
}
export function jobEvent(job,seq,type='update') { return {seq:Number(seq)||0,type:String(type).slice(0,30),at:Date.now(),state:job.state||'queued',progress:Math.max(0,Math.min(100,Number(job.progress)||0)),stage:String(job.stage||'').slice(0,100),message:String(job.message||'').slice(0,500),...(job.result!==undefined?{result:job.result}:{}),...(job.errorCode?{errorCode:String(job.errorCode).slice(0,80)}:{})}; }
