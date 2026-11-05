import React,{useState} from 'react';
import {AlertCircle,Copy,RefreshCw,X} from 'lucide-react';

const STAGES={start:'Starting sign-in',state:'Checking the sign-in cookie',github_authorize:'GitHub authorization screen',vercel_authorize:'Vercel authorization screen',token_exchange:'Exchanging the code for a token',profile:'Reading your profile',database:'Saving your PotHub account',session_handoff:'Finishing sign-in'};
const FACTS={redirectUri:'Redirect URL sent',redirectSource:'Taken from',apiOrigin:'API origin',requestHost:'Callback host',githubClientId:'GitHub client ID',vercelClientId:'Vercel client ID'};

/** Decode the compact diagnostic the server puts in ?auth_diag= (base64url JSON). Text only; never rendered as HTML. */
export function decodeAuthDiag(raw){
  try{
    const b64=String(raw||'').replace(/-/g,'+').replace(/_/g,'/');
    const bin=atob(b64+'='.repeat((4-b64.length%4)%4));
    const o=JSON.parse(new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0))));
    if(!o||typeof o!=='object')return null;
    const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';
    return {
      provider:o.p==='vercel'?'vercel':'github',
      code:str(o.c,60),stage:str(o.s,40),message:str(o.m,500),detail:str(o.d,400),ref:str(o.r,80),
      fixes:Array.isArray(o.f)?o.f.slice(0,6).map(x=>str(x,320)).filter(Boolean):[],
      facts:o.x&&typeof o.x==='object'?Object.entries(o.x).slice(0,10).map(([k,v])=>[str(k,40),str(String(v),320)]).filter(([,v])=>v):[]
    };
  }catch{return null}
}

export default function AuthIssueSheet({issue,onClose,onRetry}){
  const [copied,setCopied]=useState('');
  if(!issue)return null;
  const name=issue.provider==='vercel'?'Vercel':'GitHub';
  const stage=STAGES[issue.stage]||issue.stage;
  const report=[`PotHub ${name} sign-in problem`,`Code: ${issue.code}`,stage?`Step: ${stage}`:'',`What happened: ${issue.message}`,issue.detail?`Detail: ${issue.detail}`:'',...issue.facts.map(([k,v])=>`${FACTS[k]||k}: ${v}`),issue.ref?`Reference: ${issue.ref}`:''].filter(Boolean).join('\n');
  async function copy(text,key){try{await navigator.clipboard.writeText(text);setCopied(key);setTimeout(()=>setCopied(''),1800)}catch{setCopied('failed')}}
  return <div className="auth-issue-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="auth-issue-sheet" role="alertdialog" aria-modal="true" aria-labelledby="auth-issue-title">
      <header className="auth-issue-head"><AlertCircle aria-hidden="true"/><h2 id="auth-issue-title">{name} sign-in didn’t work</h2><button type="button" className="quiet" aria-label="Close" onClick={onClose}><X/></button></header>
      <p className="auth-issue-message">{issue.message}</p>
      {issue.detail&&<div className="auth-issue-block"><b>Exact reason</b><code>{issue.detail}</code></div>}
      {stage&&<p className="auth-issue-meta">Failed at: <b>{stage}</b> · code <code>{issue.code}</code></p>}
      {issue.fixes.length>0&&<div className="auth-issue-block"><b>How to fix it</b><ol>{issue.fixes.map((f,i)=><li key={i}>{f}</li>)}</ol></div>}
      {issue.facts.length>0&&<div className="auth-issue-block"><b>What the server used</b><dl>{issue.facts.map(([k,v])=><div key={k}><dt>{FACTS[k]||k}</dt><dd><code>{v}</code>{k==='redirectUri'&&<button type="button" className="quiet auth-issue-copy" onClick={()=>copy(v,'uri')} aria-label="Copy redirect URL"><Copy/>{copied==='uri'?'Copied':'Copy'}</button>}</dd></div>)}</dl></div>}
      {issue.ref&&<p className="auth-issue-meta">Reference <code>{issue.ref}</code> — search it in the Vercel function logs.</p>}
      <div className="auth-issue-actions">
        {onRetry&&<button type="button" className="primary" onClick={()=>onRetry(issue.provider)}><RefreshCw/> Try again</button>}
        <button type="button" className="secondary" onClick={()=>copy(report,'report')}><Copy/>{copied==='report'?'Copied':copied==='failed'?'Copy failed':'Copy details'}</button>
      </div>
    </section>
  </div>;
}
