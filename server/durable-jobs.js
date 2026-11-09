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

/** Per-account cap on queued/running jobs so one account cannot flood the shared worker queue. */
export const MAX_ACTIVE_JOBS_PER_USER = 20;
/** A job whose worker vanished is re-queued at most this many times, then failed. */
export const MAX_JOB_ATTEMPTS = 3;
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

/** UUID-shaped, deterministic id so a client retry of the same operation maps to the same job document. */
export function deterministicJobId(userId, operationId) {
  const h = crypto.createHash('sha256').update(`job:${String(userId)}:${String(operationId)}`).digest('hex');
  const variant = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Decide what to do with a `running` job whose worker lease may have lapsed. */
export function leaseRecovery(row, now = Date.now(), maxAttempts = MAX_JOB_ATTEMPTS) {
  if (!row || row.state !== 'running' || TERMINAL.has(row.state)) return 'none';
  if (row.cancelRequested) return 'none';
  if (!(Number(row.leaseExpiresAt || 0) < now)) return 'none';
  return Number(row.attempts || 0) >= maxAttempts ? 'fail' : 'requeue';
}
