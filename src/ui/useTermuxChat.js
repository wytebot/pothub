import {useCallback,useEffect,useRef,useState} from 'react';
import {db} from '../lib/db';
import {checkTermux,cleanTerminalText,isNativeAndroid,redactSecrets} from '../lib/termux';
import {executeAgentCommand,stopAgentCommand} from '../lib/agent-runtime';
import {formatRunResult} from '../lib/termux-actions';

const PERSIST_OUTPUT_CHARS=20000; // stored with the chat; the complete log stays in Termux
const RECHECK_MS=60000;

/**
 * Lets the chat agent run commands in the person's Termux.
 *  - available: Termux is installed, allowed and answered a real round trip (the server then tells the model about the tool)
 *  - run(message): the person approved the card -> run with live output -> send the result back to the agent
 *  - skip(message) / stop(message)
 * `send(text, {toolResult:true})` must submit a chat turn (App.sendMessage).
 */
export default function useTermuxChat({setMessages,send,activeChatIdRef}){
  const [available,setAvailable]=useState(false);
  const [liveIds,setLiveIds]=useState([]);
  const live=useRef(new Map());
  const lastCheck=useRef(0);
  const sendRef=useRef(send);sendRef.current=send;

  const refresh=useCallback(async(force=false)=>{
    if(!isNativeAndroid()){setAvailable(false);return false}
    if(!force&&Date.now()-lastCheck.current<RECHECK_MS)return null;
    lastCheck.current=Date.now();
    try{const c=await checkTermux();setAvailable(Boolean(c.connected));return Boolean(c.connected)}catch{setAvailable(false);return false}
  },[]);

  useEffect(()=>{
    if(!isNativeAndroid())return undefined;
    const first=setTimeout(()=>{refresh(true)},2500);
    const onVisible=()=>{if(document.visibilityState==='visible'&&live.current.size===0)refresh(false)};
    document.addEventListener('visibilitychange',onVisible);
    return()=>{clearTimeout(first);document.removeEventListener('visibilitychange',onVisible)};
  },[refresh]);

  useEffect(()=>()=>{live.current.forEach(c=>c.abort())},[]);

  const patch=useCallback((id,changes)=>setMessages(prev=>prev.map(m=>m.id===id?{...m,termuxRun:{...(m.termuxRun||{}),...changes}}:m)),[setMessages]);
  const persist=useCallback((id,changes)=>{db.messages.get(id).then(row=>row&&db.messages.put({...row,termuxRun:{...(row.termuxRun||{}),...changes,output:String(changes.output||'').slice(-PERSIST_OUTPUT_CHARS)}})).catch(()=>{})},[]);
  const setLive=()=>setLiveIds([...live.current.keys()]);

  const run=useCallback(async message=>{
    const id=message?.id,req=message?.termuxRun;
    if(!id||!req?.command||live.current.has(id))return;
    const controller=new AbortController();
    live.current.set(id,controller);setLive();
    const startedAt=Date.now(),chatAtStart=activeChatIdRef?.current;
    patch(id,{status:'running',output:'',error:'',startedAt});
    let raw='',timer=0,jobId='';
    const flush=()=>{clearTimeout(timer);timer=setTimeout(()=>patch(id,{output:cleanTerminalText(raw).slice(-200000)}),80)};
    let summary;
    try{
      const r=await executeAgentCommand({command:req.command,cwd:req.cwd||'',approved:true,provider:'termux',signal:controller.signal,onStart:j=>{jobId=j;patch(id,{jobId:j})},onOutput:t=>{raw+=t;if(raw.length>5000000)raw=raw.slice(-5000000);flush()}});
      clearTimeout(timer);
      const output=redactSecrets(cleanTerminalText(r.output));
      const status=r.stopped?'stopped':r.success?'succeeded':'failed';
      const done={status,exitCode:r.exitCode,output,durationMs:r.durationMs||Date.now()-startedAt,jobId:r.jobId||jobId};
      patch(id,done);persist(id,done);
      summary=formatRunResult({command:req.command,cwd:req.cwd,state:r.state,exitCode:r.exitCode,output});
    }catch(error){
      clearTimeout(timer);
      const text=String(error?.message||error||'Unknown error');
      const done={status:'error',error:text,output:redactSecrets(cleanTerminalText(raw)),durationMs:Date.now()-startedAt,jobId};
      patch(id,done);persist(id,done);
      summary=formatRunResult({command:req.command,cwd:req.cwd,error:text});
    }finally{live.current.delete(id);setLive()}
    // If the person moved to another chat while this ran, the result stays on the card instead of leaking into that chat.
    if(activeChatIdRef&&activeChatIdRef.current!==chatAtStart)return;
    try{await sendRef.current?.(summary,{toolResult:true})}catch(e){console.warn('[PotHub] Termux result could not be sent to the agent:',e?.message||e)}
  },[patch,persist,activeChatIdRef]);

  const stop=useCallback(message=>{
    const c=live.current.get(message?.id);
    if(c){patch(message.id,{status:'stopping'});c.abort();return}
    if(message?.termuxRun?.jobId)stopAgentCommand({executionId:message.termuxRun.jobId}).catch(()=>{});
  },[patch]);

  const skip=useCallback(message=>{if(!message?.id)return;const done={status:'skipped'};patch(message.id,done);persist(message.id,{...done,output:''})},[patch,persist]);

  return {available,liveIds,run,stop,skip,refresh};
}
