import React,{useEffect,useRef,useState} from 'react';
import {riskReason} from '../lib/termux-actions';

const LABEL={awaiting:'Waiting for your approval',running:'Running in Termux',stopping:'Stopping…',succeeded:'Finished',failed:'Failed',stopped:'Stopped',skipped:'Skipped',error:'Could not run'};
const clock=ms=>{const s=Math.max(0,Math.floor(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};

/** Approval + live output card for a command the chat agent wants to run in Termux. */
export default function TermuxRunCard({message,chat}){
  const req=message.termuxRun;
  const live=chat.liveIds.includes(message.id);
  const [confirmRisk,setConfirmRisk]=useState(false);
  const [now,setNow]=useState(Date.now());
  const outRef=useRef(null),stick=useRef(true);
  const risk=riskReason(req.command);
  const status=req.status==='running'&&!live?'interrupted':req.status;
  const busy=status==='running'||status==='stopping';
  useEffect(()=>{if(!busy)return undefined;const t=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(t)},[busy]);
  useEffect(()=>{const el=outRef.current;if(el&&stick.current)el.scrollTop=el.scrollHeight},[req.output]);
  const approve=()=>{if(risk&&!confirmRisk){setConfirmRisk(true);return}setConfirmRisk(false);chat.run(message)};
  const tone=status==='succeeded'?'ok':status==='failed'||status==='error'||status==='stopped'||status==='interrupted'?'bad':busy?'warn':'';
  return <div className={`termux-run-card ${tone}`} role="group" aria-label="Command the agent wants to run in Termux">
    <div className="termux-run-head"><strong>Run in Termux</strong><span className={`termux-run-status ${tone}`}>{status==='interrupted'?'Interrupted':LABEL[status]||status}{busy&&req.startedAt?` · ${clock(now-req.startedAt)}`:''}{req.exitCode!=null&&!busy?` · exit ${req.exitCode}`:''}</span></div>
    {req.cwd&&<div className="termux-run-cwd">Folder: <code>{req.cwd}</code></div>}
    <pre className="termux-run-cmd">{req.command}</pre>
    {req.extra>0&&<p className="termux-run-note">The agent proposed {req.extra} more command{req.extra>1?'s':''}. They are ignored for now; it will continue after this result.</p>}
    {status==='awaiting'&&(req.warnings||[]).map((w,i)=><p key={i} className="termux-run-warn">{w.level==='error'?'✖':'⚠'} {w.message}</p>)}
    {status==='awaiting'&&risk&&<p className="termux-run-warn">⚠ This command {risk}. Check it carefully before running.</p>}
    {status==='interrupted'&&<p className="termux-run-note">PotHub was closed while this ran. It may still be running in Termux (Codelab → Menu → Termux → Recent jobs).</p>}
    {req.error&&<p className="termux-run-warn">{req.error}</p>}
    {(req.output||busy)&&<pre className="termux-run-out" ref={outRef} onScroll={e=>{const el=e.currentTarget;stick.current=el.scrollHeight-el.scrollTop-el.clientHeight<40}} aria-live="polite">{req.output||'Starting…'}</pre>}
    <div className="termux-run-actions">
      {status==='awaiting'&&<><button type="button" className="primary" onClick={approve}>{confirmRisk?'Run anyway':'Run'}</button><button type="button" className="secondary" onClick={()=>{setConfirmRisk(false);chat.skip(message)}}>Skip</button></>}
      {busy&&<button type="button" className="secondary" onClick={()=>chat.stop(message)} disabled={status==='stopping'}>{status==='stopping'?'Stopping…':'Stop'}</button>}
    </div>
  </div>;
}
