import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { adminApp } from './adminApp';
import { billingStatus } from './billing';
import { unzipSync, strFromU8 } from 'fflate';

const db = () => getFirestore(adminApp());
const GH = 'https://api.github.com';
const ghHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
const safeRepo = (s: string) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s) && !s.includes('..');
async function github<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${GH}${path}`, { ...init, headers: { ...ghHeaders(token), ...(init?.headers || {}) }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) { const d = await r.json().catch(() => ({})) as { message?: string }; throw Object.assign(new Error(d.message || `GitHub API returned ${r.status}.`), { status: r.status }); }
  if (r.status === 204) return undefined as T;
  return await r.json() as T;
}
export async function doctorRepositories(token: string) {
  if (!token || token.length > 500) throw new Error('Connect GitHub in Codelab first.');
  const rows:any[]=[];
  for(let page=1;page<=100;page++){const part=await github<any[]>(token,`/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`);rows.push(...part);if(part.length<100)break;}
  return rows.map(r => ({ id:r.id, name:r.name, full_name:r.full_name, private:r.private, default_branch:r.default_branch, html_url:r.html_url, updated_at:r.updated_at }));
}
export async function doctorRuns(uid: string, token: string, repo: string) {
  if (!safeRepo(repo)) throw new Error('Invalid repository name.');
  const [workflows, runs] = await Promise.all([
    github<any>(token, `/repos/${repo}/actions/workflows?per_page=100`),
    github<any>(token, `/repos/${repo}/actions/runs?per_page=30`),
  ]);
  const docs = await db().collection('doctorJobs').where('uid','==',uid).limit(100).get();
  return { workflows: (workflows.workflows || []).map((w:any)=>({id:w.id,name:w.name,path:w.path,state:w.state})), runs:(runs.workflow_runs||[]).map((r:any)=>({id:r.id,name:r.name,workflow_id:r.workflow_id,head_branch:r.head_branch,head_sha:r.head_sha,event:r.event,status:r.status,conclusion:r.conclusion,html_url:r.html_url,created_at:r.created_at,updated_at:r.updated_at})), jobs:docs.docs.filter(d=>d.data().repo===repo).slice(0,30).map(d=>({id:d.id,...d.data()})) };
}
export async function doctorLogs(token: string, repo: string, runId: string) {
  if (!safeRepo(repo) || !/^\d{1,20}$/.test(runId)) throw new Error('Invalid run reference.');
  const r = await fetch(`${GH}/repos/${repo}/actions/runs/${runId}/logs`, { headers:ghHeaders(token), redirect:'follow', signal:AbortSignal.timeout(25_000) });
  if (!r.ok) throw Object.assign(new Error(`GitHub could not retrieve these logs (${r.status}).`),{status:r.status});
  const declared = Number(r.headers.get('content-length') || 0);
  if (declared > 20 * 1024 * 1024) return { download_url:null, message:'The GitHub log archive is larger than Pothub can safely inspect here. Open the run in GitHub to review the full logs.', log_text:'', files:[] };
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.byteLength > 20 * 1024 * 1024) return { download_url:null, message:'The GitHub log archive is larger than Pothub can safely inspect here. Open the run in GitHub to review the full logs.', log_text:'', files:[] };
  let entries:Record<string,Uint8Array>;
  try { entries=unzipSync(bytes); } catch { throw new Error('GitHub returned a log archive that Pothub could not read. Open the run directly in GitHub.'); }
  const files=Object.entries(entries).filter(([name,data])=>!name.endsWith('/')&&data.length>0&&data.length<5*1024*1024).sort(([a],[b])=>a.localeCompare(b));
  let remaining=240_000;const sections:string[]=[];
  for(const [name,data] of files){if(remaining<=0)break;const text=strFromU8(data);if(text.includes('\u0000'))continue;const excerpt=text.slice(0,remaining);sections.push(`===== ${name} =====\n${excerpt}`);remaining-=excerpt.length;}
  return { download_url:r.url!==`${GH}/repos/${repo}/actions/runs/${runId}/logs`?r.url:null, message:sections.length?'GitHub workflow logs were retrieved and extracted.':'The GitHub archive contained no readable text logs.', log_text:sections.join('\n\n'), files:files.map(([name])=>name) };
}
export async function startDoctorJob(uid: string, token: string, repo: string, operation: 'diagnose'|'validate_repair', baseSha: string, runId?: string, refBranch?: string, baseBranch?: string, repairTitle?: string, repairBody?: string) {
  if (!safeRepo(repo) || !/^[a-f0-9]{40}$/i.test(baseSha)) throw new Error('A valid repository and exact 40-character commit SHA are required.');
  if (operation === 'diagnose' && runId) {
    if (!/^\d{1,20}$/.test(runId)) throw new Error('Invalid failed workflow run.');
    const source = await github<any>(token, `/repos/${repo}/actions/runs/${runId}`);
    if (source?.repository?.full_name !== repo || source?.conclusion !== 'failure' || String(source?.head_sha || '').toLowerCase() !== baseSha.toLowerCase()) {
      throw new Error('The selected run is not a confirmed failed run for this repository and commit. Refresh the run list and try again.');
    }
  }
  const id = randomUUID(); const now = Date.now();
  await db().collection('doctorJobs').doc(id).create({ uid, repo, operation, baseSha, sourceRunId:runId || null, status:'queued', stage:'queued', events:[{stage:'queued',message:'Job queued for GitHub Actions execution.',at:now}], createdAt:now, updatedAt:now, expiresAt:Timestamp.fromMillis(now+90*24*60*60*1000) });
  try {
    const repoInfo = await github<any>(token, `/repos/${repo}`);
    await github(token, `/repos/${repo}/actions/workflows/pothub-doctor.yml/dispatches`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ref: refBranch || repoInfo.default_branch, inputs:{ job_id:id, operation, base_sha:baseSha, source_run_id:runId || '', base_branch: refBranch ? String(baseBranch || repoInfo.default_branch || 'main') : '', repair_title: String(repairTitle || 'Pothub Software Doctor repair').slice(0,240), repair_body: String(repairBody || 'Automated checks passed. Review the changes before merging.').slice(0,6000) } }) });
    await db().collection('doctorJobs').doc(id).update({status:'dispatched',stage:'dispatched',updatedAt:Date.now(),events:[{stage:'queued',message:'Job queued for GitHub Actions execution.',at:now},{stage:'dispatched',message:'GitHub accepted the workflow dispatch.',at:Date.now()}]});
    return {id,status:'dispatched'};
  } catch(e) { await db().collection('doctorJobs').doc(id).update({status:'dispatch_failed',error:e instanceof Error?e.message:'GitHub dispatch failed.',updatedAt:Date.now()}); throw e; }
}
export type RepairFile = { path: string; content: string };
const safeFilePath = (p:string) => !!p && p.length <= 500 && !p.startsWith('/') && !p.includes('\\') && p.split('/').every(x=>x && x!=='.' && x!=='..') && !/(^|\/)(\.git|\.github)(\/|$)/i.test(p);
export async function createRepairPullRequest(uid:string, token:string, repo:string, baseSha:string, files:RepairFile[], title:string, body:string) {
  if(!token || !safeRepo(repo) || !/^[a-f0-9]{40}$/i.test(baseSha)) throw new Error('A valid GitHub session, repository and exact base commit are required.');
  if(!Array.isArray(files)||files.length<1||files.length>30) throw new Error('A repair must contain between 1 and 30 changed files.');
  const clean=files.map(f=>({path:String(f.path||''),content:String(f.content??'')}));
  const paths=new Set<string>();for(const f of clean){if(!safeFilePath(f.path)||f.content.length>500_000||paths.has(f.path))throw new Error(`Unsafe, duplicate or oversized file: ${f.path.slice(0,120)}`);paths.add(f.path);}
  const total=clean.reduce((n,f)=>n+Buffer.byteLength(f.content),0);if(total>1_500_000)throw new Error('The repair exceeds the 1.5 MB patch limit. Split it into smaller changes.');
  const repoInfo=await github<any>(token,`/repos/${repo}`);
  const base=await github<any>(token,`/repos/${repo}/git/commits/${baseSha}`);
  const branch=`pothub/fix/${randomUUID().slice(0,8)}`;
  await github(token,`/repos/${repo}/git/refs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:`refs/heads/${branch}`,sha:baseSha})});
  let parent=baseSha;
  // One coherent Git commit is built from blobs + a new tree, preserving every untouched tree entry.
  const treeItems=[] as any[];
  for(const f of clean){
    const blob=await github<any>(token,`/repos/${repo}/git/blobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:Buffer.from(f.content,'utf8').toString('base64'),encoding:'base64'})});
    treeItems.push({path:f.path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const tree=await github<any>(token,`/repos/${repo}/git/trees`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base_tree:base.tree.sha,tree:treeItems})});
  const commit=await github<any>(token,`/repos/${repo}/git/commits`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:(title||'Fix verified build issue').slice(0,120),tree:tree.sha,parents:[parent]})});
  await github(token,`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha:commit.sha,force:false})});
  const prTitle=(title||'Pothub Software Doctor repair').slice(0,240);const prBody=(body||'Proposed by Pothub Software Doctor. Review the diff and validation results before merging.').slice(0,6000);
  try {
    const job=await startDoctorJob(uid,token,repo,'validate_repair',commit.sha,undefined,branch,String(repoInfo.default_branch||'main'),prTitle,prBody);
    const ref=db().doc(`doctorJobs/${job.id}`);await ref.update({repairBranch:branch,repairTitle:prTitle,repairBody:prBody,baseBranch:String(repoInfo.default_branch||'main'),commitSha:commit.sha,changedFiles:clean.map(f=>f.path),stage:'validation_dispatched',events:[{stage:'repair_branch_created',message:`Created ${branch} with ${clean.length} reviewed file change(s).`,at:Date.now()},{stage:'validation_dispatched',message:'Running repository checks before opening a pull request. No PR has been opened yet.',at:Date.now()}]});
    return {jobId:job.id,branch,commitSha:commit.sha,changedFiles:clean.map(f=>f.path)};
  } catch (error) {
    // Do not leave an orphaned repair branch when dispatch or job persistence fails.
    await github(token,`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,{method:'DELETE'}).catch(()=>undefined);
    throw error;
  }
}
export async function doctorJob(uid:string,id:string) { if(!/^[a-f0-9-]{30,40}$/i.test(id))return null; const s=await db().doc(`doctorJobs/${id}`).get();const d=s.data();return d&&d.uid===uid?{id:s.id,...d}:null; }
export async function acceptDoctorWebhook(raw: Buffer, signature: string | undefined, secret: string) {
  if (!secret || !signature) throw new Error('Missing webhook authentication.');
  const wanted = `sha256=${createHmac('sha256',secret).update(raw).digest('hex')}`;
  const a=Buffer.from(wanted);const b=Buffer.from(signature);if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error('Invalid webhook signature.');
  const body=JSON.parse(raw.toString('utf8')) as {job_id?:string;repo?:string;run_id?:string;status?:string;stage?:string;message?:string;report?:unknown;files?:unknown;pull_request_url?:string;commit_sha?:string};
  if(!body.job_id||!/^[a-f0-9-]{30,40}$/i.test(body.job_id))throw new Error('Invalid job id.');
  if(typeof body.repo!=='string'||!safeRepo(body.repo))throw new Error('Invalid repository in callback.');
  const statuses=new Set(['queued','in_progress','completed','failed','cancelled','validation_failed','dispatch_failed']);
  if(body.status!==undefined&&!statuses.has(body.status))throw new Error('Invalid callback status.');
  if(body.run_id!==undefined&&!/^\d{1,20}$/.test(body.run_id))throw new Error('Invalid workflow run ID.');
  if(body.commit_sha!==undefined&&!/^[a-f0-9]{40}$/i.test(body.commit_sha))throw new Error('Invalid callback commit SHA.');
  if(body.pull_request_url!==undefined){let u:URL;try{u=new URL(body.pull_request_url)}catch{throw new Error('Invalid pull request URL.')}if(u.protocol!=='https:'||u.hostname!=='github.com'||!/^\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(u.pathname))throw new Error('Pull request URL must point to a GitHub pull request.');}
  let safeReport: { workflow_run_url?: string; artifact_name?: string } | undefined;
  if(body.report!==undefined){
    if(!body.report||typeof body.report!=='object'||Array.isArray(body.report))throw new Error('Invalid callback report.');
    const report=body.report as Record<string,unknown>;
    const runUrl=typeof report.workflow_run_url==='string'?report.workflow_run_url:'';
    const artifact=typeof report.artifact_name==='string'?report.artifact_name:'';
    if(runUrl){let u:URL;try{u=new URL(runUrl)}catch{throw new Error('Invalid workflow run URL.')}if(u.protocol!=='https:'||u.hostname!=='github.com'||!/^\/[^/]+\/[^/]+\/actions\/runs\/\d+\/?$/.test(u.pathname))throw new Error('Workflow run URL must point to GitHub Actions.');}
    if(artifact&&!/^pothub-doctor-[a-f0-9-]{30,40}$/i.test(artifact))throw new Error('Invalid evidence artifact name.');
    safeReport={...(runUrl?{workflow_run_url:runUrl}:{}),...(artifact?{artifact_name:artifact}:{})};
  }
  // Source files, raw logs and conversation text are intentionally never persisted by Pothub. They remain in GitHub.
  if(body.files!==undefined)throw new Error('File content must remain in GitHub; Pothub does not accept file uploads in job callbacks.');
  const ref=db().doc(`doctorJobs/${body.job_id}`);await db().runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists)throw new Error('Unknown job.');const d=s.data()!;if(body.repo!==d.repo)throw new Error('Webhook repository does not match the job.');
    const terminal=new Set(['completed','failed','cancelled','validation_failed','dispatch_failed']);
    if(terminal.has(String(d.status))&&body.status!==d.status)return;
    const events=Array.isArray(d.events)?d.events.slice(-99):[];const stage=String(body.stage||body.status||'update').slice(0,80);const message=String(body.message||'Workflow update').slice(0,1000);
    if(!events.some((e:any)=>e.stage===stage&&e.message===message&&Number(e.at)>Date.now()-60_000))events.push({stage,message,at:Date.now()});
    const update:any={events,status:body.status||d.status,stage,updatedAt:Date.now()};if(safeReport!==undefined)update.report=safeReport;if(body.pull_request_url)update.pullRequestUrl=body.pull_request_url;if(body.commit_sha)update.commitSha=body.commit_sha;if(body.run_id)update.workflowRunId=body.run_id;tx.update(ref,update);
  });
}
/** Persist only the repositories explicitly selected by the account owner. */
export async function getDoctorRepoSelection(uid:string){const s=await db().doc(`doctorRepoSelections/${uid}`).get();return {repositories:Array.isArray(s.data()?.repositories)?s.data()!.repositories as string[]:[]}}
export async function setDoctorRepoSelection(uid:string,token:string,requested:unknown){
  if(!Array.isArray(requested)||requested.length>1000||requested.some(x=>typeof x!=='string'||!safeRepo(x)))throw new Error('Choose valid GitHub repositories.');
  const billing=await billingStatus({uid,emailVerified:false});
  const cap=billing.plan==='free'?2:billing.plan==='pro'?10:Infinity;
  const unique=[...new Set(requested as string[])];if(unique.length>cap)throw new Error(`Your ${billing.plan} plan can connect ${cap===Infinity?'unlimited':cap} repositories.`);
  const available=await doctorRepositories(token);const allowed=new Set(available.map(r=>r.full_name));if(unique.some(r=>!allowed.has(r)))throw new Error('One or more selected repositories are not accessible to your GitHub account.');
  const hookSecret=process.env.GITHUB_WEBHOOK_SECRET||'';const hookUrl=`${String(process.env.APP_ORIGIN||'').replace(/\/$/,'')}/api/webhooks/github`;
  if(unique.length&&(!hookSecret||!/^https:\/\//.test(hookUrl)))throw new Error('Build notifications need GITHUB_WEBHOOK_SECRET and a valid APP_ORIGIN on the server.');
  for(let i=0;i<unique.length;i+=5){await Promise.all(unique.slice(i,i+5).map(async full=>{const hooks=await github<any[]>(token,`/repos/${full}/hooks?per_page=100`);const existing=hooks.find(h=>h.config?.url===hookUrl);const payload={name:'web',active:true,events:['workflow_run'],config:{url:hookUrl,content_type:'json',secret:hookSecret,insecure_ssl:'0'}};if(existing)await github(token,`/repos/${full}/hooks/${existing.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});else await github(token,`/repos/${full}/hooks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}));}
  await db().doc(`doctorRepoSelections/${uid}`).set({repositories:unique,updatedAt:Date.now()},{merge:true});return {repositories:unique,limit:Number.isFinite(cap)?cap:null};
}
export async function assertDoctorRepoSelected(uid:string,repo:string){const s=await getDoctorRepoSelection(uid);if(!s.repositories.includes(repo))throw new Error('Select this repository in your connected repositories before using Software Doctor.');}
