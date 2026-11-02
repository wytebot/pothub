import {wl,pot} from "./bridge";
const api=(path,opts={})=>wl(path,opts);
export const github={
 session:()=>api("/auth/me"),previewUsage:(repo,consume=false)=>consume?api("/preview/usage",{method:"POST",body:JSON.stringify({repo})}):api(`/preview/usage?repo=${encodeURIComponent(repo)}`),login:()=>{window.dispatchEvent(new Event("pothub:reconnect-github"))},logout:async()=>({ok:true}),
 firebaseLogin:(idToken)=>api("/auth/firebase",{method:"POST",body:JSON.stringify({idToken})}),
 repos:async()=>{const d=await pot("/api/github/repos");const repos=Array.isArray(d.repos)?d.repos:[];return {repos,total:repos.length,limit:null,plan:"pro",stale:false}},
 createRepo:async(p)=>{const r=await pot("/api/github/create-repo",{method:"POST",body:JSON.stringify({name:p.name,description:p.description||"",visibility:p.private===false?"public":"private",license:p.license_template||"none",autoInit:true}),idempotencyKey:p.operationId||undefined});return r.repo||r.repository||r},
 deleteRepo:(o,r)=>pot("/api/github/delete-repo",{method:"POST",body:JSON.stringify({owner:o,repo:r,confirmName:r})}),
 tree:(o,r,b)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/tree?branch=${encodeURIComponent(b)}`),
 file:(o,r,p,b)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/file?path=${encodeURIComponent(p)}&branch=${encodeURIComponent(b)}`),
 branches:(o,r)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/branches`),
 createBranch:(o,r,p)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/branches`,{method:"POST",body:JSON.stringify(p)}),
 pulls:(o,r)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls`),
 createPull:(o,r,p)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls`,{method:"POST",body:JSON.stringify(p)}),
 blob:(o,r,p)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/blob`,{method:"POST",body:JSON.stringify(p)}),
 commit:(o,r,p)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/commit`,{method:"POST",body:JSON.stringify(p)}),
 planAgent:(p)=>pot("/api/github/agent/plan",{method:"POST",body:JSON.stringify(p),idempotencyKey:p.operationId}),
 approvedAgentCommit:(p)=>pot("/api/github/agent/commit-approved",{method:"POST",body:JSON.stringify({...p,approved:true}),idempotencyKey:p.operationId}),
 commits:(o,r,branch,limit=10)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/commits?branch=${encodeURIComponent(branch)}&limit=${encodeURIComponent(limit)}`),
 revert:(o,r,p)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/revert`,{method:"POST",body:JSON.stringify(p)}),
 actionsRuns:(o,r)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs`),
 actionsJobs:(o,r,id)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs/${encodeURIComponent(id)}/jobs`),
 rerunFailed:(o,r,id,p={})=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs/${encodeURIComponent(id)}/rerun-failed`,{method:"POST",body:JSON.stringify(p)}),
 cancelRun:(o,r,id,force=false)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs/${encodeURIComponent(id)}/${force?"force-cancel":"cancel"}`,{method:"POST"}),
 workflows:(o,r)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/workflows`),
 dispatchWorkflow:(o,r,id,p)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/workflows/${encodeURIComponent(id)}/dispatch`,{method:"POST",body:JSON.stringify(p)}),
 licenseTemplate:(key)=>api(`/github/licenses/${encodeURIComponent(key)}`),
 issues:(o,r,state="open")=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/issues?state=${encodeURIComponent(state)}`),
 createIssue:(o,r,p)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/issues`,{method:"POST",body:JSON.stringify(p)}),
 releases:(o,r)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/releases`),
 createRelease:(o,r,p)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/releases`,{method:"POST",body:JSON.stringify(p)}),
 compare:(o,r,b,h)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/compare?base=${encodeURIComponent(b)}&head=${encodeURIComponent(h)}`),
 pullList:(o,r,state="open")=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls?state=${encodeURIComponent(state)}`),
 mergePull:(o,r,n,p)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls`,{method:"POST",body:JSON.stringify({number:n,...p})}),
 starStatus:(o,r)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/star`),
 star:(o,r)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/star`,{method:"PUT"}),
 unstar:(o,r)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/star`,{method:"DELETE"}),
 fork:(o,r,name)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/fork`,{method:"POST",body:JSON.stringify({name})}),
 driveExport:(o,r,b)=>api(`/github/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/drive-export`,{method:"POST",body:JSON.stringify({branch:b})}),
 googleDriveStatus:async()=>({connected:false}),
 googleDriveDisconnect:async()=>({ok:true})
};
export function githubErrorMessage(status,body=""){
  if(status===401) return "Your login session has expired or GitHub authorization is no longer valid. Sign in again to continue.";
  if(status===403) return "GitHub denied the request. Check repository permissions or rate limits.";
  if(status===404) return "GitHub could not find that repository or file, or you do not have access.";
  if(status===409) return "GitHub reported a conflict. Pull latest changes and review them.";
  if(status===422) return "GitHub rejected the request. Check the branch, path, or commit data.";
  return body ? `GitHub request failed (${status}): ${body}` : `GitHub request failed (${status}).`;
}
