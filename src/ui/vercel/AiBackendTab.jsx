import React from 'react';
import {saveAgent,decryptSecret} from '../../lib/agents';
import {db} from '../../lib/db';
import {BACKEND_LABEL,isBackendAgent,backendModeEnabled,backendModeStored,setBackendMode} from '../../lib/backend-mode';
import ReauthNotice from './ReauthNotice.jsx';
import {needsVercelReauth,envDashboardUrl} from '../../lib/vercel-env.js';

const DEFAULTS={keyEnv:'GEMINI_API_KEY',modelEnv:'GEMINI_MODEL',fallbackEnv:'GEMINI_FALLBACK_MODELS'};
const cleanUrl=value=>String(value||'').trim().replace(/\/+$/,'');
const parseModels=value=>[...new Set(String(value||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean))].slice(0,7);

export default function AiBackendTab({api,project,onReauthorize,onNotice,onSaved}){
 const apiRef=React.useRef(api);apiRef.current=api;
 const selected=project?.id||'',envUrl=envDashboardUrl(project);
 const [config,setConfig]=React.useState(null),[backendUrl,setBackendUrl]=React.useState(''),[keyEnv,setKeyEnv]=React.useState(DEFAULTS.keyEnv),[modelEnv,setModelEnv]=React.useState(DEFAULTS.modelEnv),[fallbackEnv,setFallbackEnv]=React.useState(DEFAULTS.fallbackEnv);
 const [apiKey,setApiKey]=React.useState(''),[model,setModel]=React.useState(''),[fallbacks,setFallbacks]=React.useState(''),[targets,setTargets]=React.useState(['production','preview','development']);
 const [busy,setBusy]=React.useState(''),[message,setMessage]=React.useState(''),[error,setError]=React.useState(''),[configured,setConfigured]=React.useState(false);
 const [agentRows,setAgentRows]=React.useState([]),[backendOn,setBackendOn]=React.useState(false),[imageModel,setImageModel]=React.useState(''),[newFn,setNewFn]=React.useState('Chat'),[newModel,setNewModel]=React.useState('');
 const reloadAgents=React.useCallback(async()=>{const order={Chat:0,Image:1,Diagnosis:2,'Fix generation':3},rows=(await db.agents.toArray()).filter(isBackendAgent).sort((a,b)=>(order[a.function]??9)-(order[b.function]??9));setAgentRows(rows);setBackendOn(await backendModeEnabled())},[]);
 React.useEffect(()=>{reloadAgents()},[reloadAgents]);
 async function toggleDefault(a){setError('');try{await db.agents.update(a.id,{default:!a.default,updatedAt:new Date().toISOString()});await reloadAgents();await onSaved?.()}catch(e){fail(e)}}
 async function toggleBackendMode(on){setError('');try{if(on&&!agentRows.length)throw new Error('Save the backend configuration first so there is a Vercel Backend AI to route through.');await setBackendMode(on);setBackendOn(on);notify(on?'Vercel backend only is ON. PotHub no longer calls provider APIs directly; chat, image and fix requests go only through the ticked Vercel Backend AIs.':'Vercel backend only is OFF. Your direct API agents work again.');await onSaved?.()}catch(e){fail(e)}}
 async function addBackendAi(e){e?.preventDefault?.();setError('');setMessage('');const modelId=newModel.trim();if(!modelId)return fail('Enter the model ID this AI should use.');const base=agentRows[0];if(!base)return fail('Save the backend configuration first.');setBusy('add');try{const token=await decryptSecret(base.secret);await saveAgent({function:newFn,provider:'openai-compatible',baseUrl:base.baseUrl,model:modelId,models:[modelId],modelVariants:'',modelEnv:base.modelEnv,keyEnv:base.keyEnv,fallbackEnv:base.fallbackEnv,key:token,label:BACKEND_LABEL,default:true,multi:true});setNewModel('');await reloadAgents();await onSaved?.();notify(`Added a ${newFn} AI (${modelId}) and ticked it as a default.`)}catch(e2){fail(e2)}finally{setBusy('')}}
 const notify=(text)=>{setMessage(text);setError('');onNotice?.(text)};
 const fail=(e)=>{setError(String(e?.message||e||'The operation could not be completed.'));setMessage('')};
 function toggleTarget(value){setTargets(old=>old.includes(value)?old.filter(x=>x!==value):[...old,value])}
 async function configure(e){
  e?.preventDefault?.();setError('');setMessage('');
  const url=cleanUrl(backendUrl),fallbackModels=parseModels(fallbacks);
  if(!url.startsWith('https://'))return fail('Enter a public HTTPS backend URL.');
  if(!selected)return fail('Select a Vercel project first.');
  if(!apiKey.trim())return fail('Enter the provider API key to store in the selected Vercel project.');
  if(!model.trim())return fail('Enter the primary model ID.');
  if(!targets.length)return fail('Select at least one deployment target.');
  setBusy('save');
  try{
   const result=await api('/api/vercel/backend/configure',{method:'POST',body:JSON.stringify({backendUrl:url,keyEnv:keyEnv.trim(),modelEnv:modelEnv.trim(),fallbackEnv:fallbackEnv.trim(),model:model.trim(),fallbackModels,apiKey:apiKey.trim(),targets})});
   const token=result.backendToken;
   for(const fn of ['Chat','Diagnosis','Fix generation']){
    const old=await db.agents.where('function').equals(fn).filter(a=>a.label==='Vercel Backend'&&a.provider==='openai-compatible').first();
    await saveAgent({id:old?.id,function:fn,provider:'openai-compatible',baseUrl:url,model:model.trim(),models:[model.trim(),...fallbackModels],modelVariants:fallbackModels.join('\n'),modelEnv:modelEnv.trim(),keyEnv:keyEnv.trim(),fallbackEnv:fallbackEnv.trim(),key:token,label:BACKEND_LABEL,default:true,multi:true});
   }
   if(imageModel.trim()){const oldImage=await db.agents.where('function').equals('Image').filter(isBackendAgent).first();await saveAgent({id:oldImage?.id,function:'Image',provider:'openai-compatible',baseUrl:url,model:imageModel.trim(),models:[imageModel.trim()],modelVariants:'',modelEnv:modelEnv.trim(),keyEnv:keyEnv.trim(),fallbackEnv:fallbackEnv.trim(),key:token,label:BACKEND_LABEL,default:true,multi:true})}
   if((await backendModeStored())===null)await setBackendMode(true);
   await reloadAgents();
   setApiKey('');setConfig(result.config);setConfigured(true);notify('Backend settings saved to Vercel and the Vercel Backend agent was added for Chat, Diagnosis and Fix. Redeploy the selected project to activate its environment variables.');
   await onSaved?.();
  }catch(e){fail(e)}finally{setBusy('')}
 }
 async function testBackend(){
  setBusy('test');setError('');setMessage('');
  try{
   const agent=await db.agents.where('function').equals('Chat').filter(a=>a.label==='Vercel Backend'&&a.provider==='openai-compatible').first();
   if(!agent?.secret)throw new Error('Save the backend configuration first on this device so its encrypted access token is available.');
   const token=await decryptSecret(agent.secret);
   const result=await api('/api/vercel/backend/test',{method:'POST',body:JSON.stringify({backendUrl:cleanUrl(backendUrl),backendToken:token}),timeoutMs:18000,noRetry:true});
   notify(result.note||'Backend endpoint is responding.');
  }catch(e){fail(e)}finally{setBusy('')}
 }

 const loadConfig=React.useCallback(async()=>{
  setBusy('load');setError('');
  try{
   const meta=await apiRef.current('/api/vercel/backend/config');
   setConfig(meta.config||null);
   if(meta.config){setBackendUrl(meta.config.backendUrl||'');setKeyEnv(meta.config.keyEnv||DEFAULTS.keyEnv);setModelEnv(meta.config.modelEnv||DEFAULTS.modelEnv);setFallbackEnv(meta.config.fallbackEnv||DEFAULTS.fallbackEnv);setModel(meta.config.model||'');setFallbacks((meta.config.fallbackModels||[]).join('\n'));setTargets(meta.config.targets||['production','preview','development']);setConfigured(String(meta.config.projectId||'')===String(selected||meta.projectId||''))}
   else setConfigured(false);
  }catch(e){fail(e)}finally{setBusy('')}
 },[selected]);
 React.useEffect(()=>{if(selected)loadConfig()},[selected,loadConfig]);
 return <div className="vx-stack vx-ai">
  {!project&&<section className="vx-card"><p className="vx-empty">Pick a project in Import first. The AI backend is saved to that project.</p></section>}
  {project&&<>
  {(agentRows.length>0||configured)&&<div className="panel vb-agents">
   <div className="vb-section-head"><div><h2>Your backend AIs</h2><p>Tick the AIs PotHub should use. Tick two or more for Chat, or for Image: PotHub tries them in the order listed and moves to the next if one fails.</p></div></div>
   <label className="vb-switch"><input type="checkbox" checked={backendOn} onChange={e=>toggleBackendMode(e.target.checked)}/><span><strong>Vercel backend only</strong><small>On: PotHub stops calling provider APIs directly and reads only from your Vercel backend.</small></span></label>
   {agentRows.length?<div className="vb-agent-list">{agentRows.map(a=><label key={a.id} className={`vb-agent-row ${a.default?'on':''}`}><input type="checkbox" checked={!!a.default} onChange={()=>toggleDefault(a)}/><span><strong>{a.function}</strong><small>{a.model}{(a.models||[]).length>1?` · +${a.models.length-1} fallback`:''}</small></span><em>{a.default?'Default':'Off'}</em></label>)}</div>:<p className="vb-muted">No Vercel Backend AIs yet. Save the configuration below.</p>}
   {agentRows.length>0&&<form className="vb-add-ai" onSubmit={addBackendAi}><div className="vb-function-options" role="group" aria-label="AI function">{['Chat','Image','Diagnosis','Fix generation'].map(f=><button type="button" key={f} className={newFn===f?'active':''} aria-pressed={newFn===f} onClick={()=>setNewFn(f)}>{f}</button>)}</div><input value={newModel} onChange={e=>setNewModel(e.target.value)} placeholder="Model ID" autoCapitalize="none" autoCorrect="off" spellCheck="false"/><button type="submit" className="secondary" disabled={!!busy}>Add AI</button></form>}
  </div>}
   <form className="panel vb-config" onSubmit={configure}>
    <div className="vb-section-head"><div><h2>Backend configuration</h2><p>PotHub sends AI requests to this URL. The endpoint must implement the OpenAI-compatible API.</p></div></div>
    <label>Backend base URL<input value={backendUrl} onChange={e=>setBackendUrl(e.target.value)} placeholder="https://your-project.vercel.app/v1" autoCapitalize="none" autoCorrect="off" spellCheck="false" inputMode="url"/></label>
    <div className="vb-two-col"><label>Provider API-key variable<input value={keyEnv} onChange={e=>setKeyEnv(e.target.value.toUpperCase())} placeholder="GEMINI_API_KEY" autoCapitalize="characters"/></label><label>Model variable<input value={modelEnv} onChange={e=>setModelEnv(e.target.value.toUpperCase())} placeholder="GEMINI_MODEL" autoCapitalize="characters"/></label></div>
    <label>Provider API key<input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={configured?'Enter a new key to rotate the stored key':'Paste the provider key to store in Vercel'} autoComplete="new-password"/></label>
    <label>Primary model ID<input value={model} onChange={e=>setModel(e.target.value)} placeholder="Enter the exact active model ID" autoCapitalize="none" autoCorrect="off" spellCheck="false"/></label>
    <label>Image model ID (optional)<input value={imageModel} onChange={e=>setImageModel(e.target.value)} placeholder="Adds an Image AI that uses your backend's /images/generations" autoCapitalize="none" autoCorrect="off" spellCheck="false"/></label>
    <label>Fallback model IDs<textarea rows={3} value={fallbacks} onChange={e=>setFallbacks(e.target.value)} placeholder="One model ID per line"/></label>
    <label>Fallback-model environment variable<input value={fallbackEnv} onChange={e=>setFallbackEnv(e.target.value.toUpperCase())}/></label>
    <div className="vb-targets"><strong>Apply environment variables to</strong><div>{['production','preview','development'].map(t=><label key={t}><input type="checkbox" checked={targets.includes(t)} onChange={()=>toggleTarget(t)}/>{t[0].toUpperCase()+t.slice(1)}</label>)}</div></div>
    <div className="vb-security-note"><strong>Credential protection</strong><p>The provider key is sent directly to Vercel over HTTPS and is not saved in PotHub's database. Vercel stores it as an encrypted environment variable. A separate generated backend token is stored in the local encrypted agent vault and as a secret environment variable. Never add either secret to a NEXT_PUBLIC_ variable.</p></div>
    <button className="primary" type="submit" disabled={!!busy||!selected}>{busy==='save'?'Saving securely…':'Save backend to Vercel'}</button>
   </form>
   {configured&&<div className="panel vb-status"><div className="vb-section-head"><div><h2>Backend status</h2><p>Configuration metadata is saved. Secret values are never read back into this page.</p></div><span className="vb-state">Configured</span></div><div className="vb-meta"><span>Backend URL</span><strong>{config?.backendUrl||backendUrl}</strong><span>API key variable</span><strong>{config?.keyEnv||keyEnv}</strong><span>Model variable</span><strong>{config?.modelEnv||modelEnv}</strong><span>Fallbacks</span><strong>{(config?.fallbackModels||parseModels(fallbacks)).join(', ')||'None configured'}</strong><span>Targets</span><strong>{(config?.targets||targets).join(', ')}</strong></div><button type="button" className="secondary" onClick={testBackend} disabled={!!busy}>{busy==='test'?'Testing endpoint…':'Test backend endpoint'}</button><p className="vb-muted">After saving environment variables, redeploy the selected Vercel project. The endpoint must expose GET /models and POST /chat/completions, and validate the generated Bearer token against POTHUB_BACKEND_TOKEN. PotHub's own server also needs POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS=true before it can call a custom backend URL.</p></div>}
   <p className="vb-dashboard-link"><a href={envUrl} target="_blank" rel="noreferrer">Manage environment variables directly in Vercel ↗</a></p>
  </>}
  {error&&(needsVercelReauth(error)?<ReauthNotice onReauthorize={onReauthorize}/>:<div className="vb-feedback error" role="alert">{error}</div>)}
  {message&&<div className="vb-feedback success" role="status">{message}</div>}
 </div>;
}
