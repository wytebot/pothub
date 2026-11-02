import { useMemo, useState } from 'react';
import { Bot, CheckCircle2, GitBranch, Loader2, X } from 'lucide-react';
import { github } from '../github';
import { toastError, toastSuccess } from '../toast';
import { openExternal } from '../utils';

const makeId=()=>`agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
export default function AgentPlanPanel({ repo, branch, onClose }) {
  const owner=repo.owner?.login||repo.full_name?.split('/')[0]||repo.owner;
  const name=repo.name||repo.full_name?.split('/')[1];
  const [goal,setGoal]=useState(''); const [plan,setPlan]=useState(null); const [selected,setSelected]=useState({});
  const [busy,setBusy]=useState(false); const [committed,setCommitted]=useState(null); const [makingPr,setMakingPr]=useState(false);
  const chosen=useMemo(()=>plan?.files?.filter(f=>selected[f.path])||[],[plan,selected]);
  const createPlan=async()=>{if(goal.trim().length<8)return;setBusy(true);try{const result=await github.planAgent({owner,repo:name,branch,goal:goal.trim(),operationId:makeId()});setPlan(result);setSelected(Object.fromEntries((result.files||[]).map(f=>[f.path,true])));setCommitted(null);if(!result.files?.length)toastError('The agent could not produce a safe change set.');}catch(e){toastError(e.message||'Agent planning failed.');}finally{setBusy(false)}};
  const commit=async()=>{if(!plan||!chosen.length)return;setBusy(true);try{const result=await github.approvedAgentCommit({owner,repo:name,baseBranch:plan.branch,expectedBaseSha:plan.baseSha,commitMessage:`PotHub agent: ${goal.trim().slice(0,110)}`,files:chosen.map(f=>({path:f.path,content:f.content})),operationId:makeId()});setCommitted(result);toastSuccess(`Approved changes committed to ${result.branch}.`);}catch(e){toastError(e.message||'Commit failed. Refresh and review the base branch.');}finally{setBusy(false)}};
  const createPr=async()=>{if(!committed)return;setMakingPr(true);try{const result=await github.createPull(owner,name,{head:committed.branch,base:plan.branch,title:`PotHub agent: ${goal.trim().slice(0,150)}`,body:`## Summary\n${plan.summary}\n\n## Plan\n${(plan.steps||[]).map((s,i)=>`${i+1}. ${s}`).join('\n')}\n\nGenerated and explicitly approved in PotHub Codelab. Please review and run checks before merging.`});toastSuccess(`Pull request #${result.number} created.`);openExternal(result.url);}catch(e){toastError(e.message||'Pull request creation failed. The approved branch remains available.');}finally{setMakingPr(false)}};
  return <section className="agentPlanPanel" role="dialog" aria-modal="true" aria-labelledby="agentPlanTitle">
    <header><div><Bot size={19}/><strong id="agentPlanTitle">Codelab agent</strong><small>{owner}/{name} · {branch}</small></div><button onClick={onClose} aria-label="Close agent panel"><X size={18}/></button></header>
    {!plan&&<div className="agentPlanPrompt"><label htmlFor="agentGoal">What should the agent build or fix?</label><textarea id="agentGoal" value={goal} onChange={e=>setGoal(e.target.value)} maxLength={6000} rows={5} placeholder="Describe the goal and any constraints. The agent will inspect relevant files and propose changes for review."/><p>Nothing is committed automatically. Secrets and sensitive paths are excluded from context.</p><button className="primary" disabled={busy||goal.trim().length<8} onClick={createPlan}>{busy?<Loader2 className="spin" size={16}/>:<Bot size={16}/>} Plan changes</button></div>}
    {plan&&<><div className="agentPlanSummary"><b>Plan</b><p>{plan.summary}</p><ol>{(plan.steps||[]).map((step,i)=><li key={i}>{step}</li>)}</ol><p className="muted">Base branch SHA: <code>{plan.baseSha}</code> · {plan.creditsSpent||0} credit(s) charged under your 3-successful-job batch rule.</p></div>
      <div className="agentPlanFiles">{plan.files.map(f=><article key={f.path}><label><input type="checkbox" checked={!!selected[f.path]} disabled={!!committed} onChange={e=>setSelected(v=>({...v,[f.path]:e.target.checked}))}/><b>{f.path}</b></label><p>{f.reason}</p><details><summary>Review proposed file content</summary><pre>{f.content}</pre></details></article>)}</div>
      {!committed?<footer><button onClick={()=>{setPlan(null);setSelected({})}} disabled={busy}>Discard plan</button><button className="primary" onClick={commit} disabled={busy||!chosen.length}>{busy?<Loader2 className="spin" size={16}/>:<GitBranch size={16}/>} Approve {chosen.length} file(s) and commit to new branch</button></footer>:<footer><span><CheckCircle2 size={16}/> Branch created: <code>{committed.branch}</code></span><button onClick={createPr} disabled={makingPr}>{makingPr?<Loader2 className="spin" size={16}/>:null} Create PR</button><button onClick={onClose}>Done</button></footer>}
    </>}
  </section>;
}
