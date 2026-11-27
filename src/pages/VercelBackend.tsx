import { useEffect, useState } from 'react';
import { Select } from '../ui/Select';
import { loadVercelToken, vcProjects, vcEnvList, vcEnvCreate, vcEnvUpdate, vcEnvDelete, type VcProject, type VcEnvVariable } from '../repo/vercel';

const TARGETS = ['production','preview','development'];
type Type = 'plain'|'secret'|'encrypted';
export function VercelBackend() {
  const [token,setToken]=useState<string|null>(null); const [projects,setProjects]=useState<VcProject[]>([]); const [projectId,setProjectId]=useState('');
  const [vars,setVars]=useState<VcEnvVariable[]>([]); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [note,setNote]=useState('');
  const [name,setName]=useState(''); const [value,setValue]=useState(''); const [type,setType]=useState<Type>('secret'); const [targets,setTargets]=useState<string[]>(TARGETS); const [comment,setComment]=useState(''); const [editing,setEditing]=useState<VcEnvVariable|null>(null);
  const project=projects.find(p=>p.id===projectId)||null;
  useEffect(()=>{let live=true; void loadVercelToken().then(async t=>{if(!live)return;setToken(t);if(!t)return;try{const p=await vcProjects(t);if(!live)return;setProjects(p);setProjectId(p[0]?.id||'');}catch(e){if(live)setError(e instanceof Error?e.message:'Could not read Vercel projects.');}});return()=>{live=false;};},[]);
  const refresh=async()=>{if(!token||!project)return;setBusy(true);setError('');try{setVars(await vcEnvList(token,project.id,project.team));}catch(e){setError(e instanceof Error?e.message:'Failed to read variables.');}finally{setBusy(false);}};
  useEffect(()=>{void refresh();},[token,projectId]);
  const reset=()=>{setEditing(null);setName('');setValue('');setType('secret');setTargets(TARGETS);setComment('');};
  const submit=async()=>{if(!token||!project||!name.trim()||!value)return;setBusy(true);setError('');setNote('');try{if(editing)await vcEnvUpdate(token,project.id,project.team,editing.id,name.trim(),value,type,targets,comment);else await vcEnvCreate(token,project.id,project.team,name.trim(),value,type,targets,comment);setNote(editing?'Environment variable updated.':'Environment variable created.');reset();setVars(await vcEnvList(token,project.id,project.team));}catch(e){setError(e instanceof Error?e.message:'Could not save variable.');}finally{setBusy(false);}};
  const edit=(v:VcEnvVariable)=>{setEditing(v);setName(v.key);setValue('');setType(v.type==='plain'?'plain':'secret');setTargets(v.targets.filter(t=>TARGETS.includes(t)));setComment(v.comment);setNote('Edit/rotate requires a new value; Vercel does not return existing secret values.');};
  const remove=async(v:VcEnvVariable)=>{if(!token||!project||!confirm(`Delete ${v.key} from this Vercel project?`))return;setBusy(true);try{await vcEnvDelete(token,project.id,project.team,v.id);setVars(x=>x.filter(z=>z.id!==v.id));setNote(`${v.key} deleted.`);}catch(e){setError(e instanceof Error?e.message:'Could not delete variable.');}finally{setBusy(false);}};
  if(token===null)return <section className="page"><div className="panel">Loading Vercel connection…</div></section>;
  if(!token)return <section className="page"><h1>Vercel Backend</h1><div className="panel"><p>Connect Vercel from Deployments first. This backend manager uses your existing encrypted/on-device Vercel session.</p><a className="btn primary" href="#/deployments">Go to Deployments</a></div></section>;
  return <section className="page rp"><h1>Vercel Backend</h1><p className="rp-muted">Manage environment variables and secrets for your Vercel projects. Existing values are never revealed by Vercel; editing or rotating requires entering a replacement value.</p>
    <div className="rp-card"><div className="rp-bar"><Select label="Vercel project" value={projectId} options={projects.map(p=>({value:p.id,label:p.name}))} onChange={setProjectId} className="rp-sel"/><button className="btn" disabled={busy||!project} onClick={()=>void refresh()}>Refresh</button></div>
    {project&&<p className="rp-sub">{project.repo||project.framework||project.name} · project {project.id}</p>}
    {error&&<p className="rp-err" role="alert">{error}</p>}{note&&<p className="rp-muted" role="status">{note}</p>}
    <h2>{editing?'Edit / rotate variable':'Create variable or secret'}</h2>
    <div className="rp-stack"><label>Variable name<input value={name} onChange={e=>setName(e.target.value)} placeholder="DATABASE_URL" autoCapitalize="characters" /></label><label>New value or secret<textarea value={value} onChange={e=>setValue(e.target.value)} rows={3} placeholder="Enter value (never loaded from Vercel)" autoComplete="off" /></label>
    <label>Value type<select value={type} onChange={e=>setType(e.target.value as Type)}><option value="secret">Secret / encrypted</option><option value="plain">Plain</option></select></label><label>Comment (optional)<input value={comment} onChange={e=>setComment(e.target.value)} /></label>
    <div className="rp-bar" aria-label="Environment targets">{TARGETS.map(t=><label key={t} className="rp-target"><input type="checkbox" checked={targets.includes(t)} onChange={e=>setTargets(old=>e.target.checked?[...old,t]:old.filter(x=>x!==t))}/>{t}</label>)}</div>
    <div className="rp-bar"><button className="btn primary" disabled={busy||!name.trim()||!value||!targets.length} onClick={()=>void submit()}>{busy?'Saving…':editing?'Save replacement':'Create variable'}</button>{editing&&<button className="btn" onClick={reset}>Cancel edit</button>}</div></div>
    </div>
    <div className="rp-card"><div className="rp-chead"><h2>Environment variables</h2><span className="rp-pill idle">{vars.length}</span></div>{busy&&!vars.length?<p>Loading…</p>:!vars.length?<p className="rp-muted">No variables found in this project.</p>:<div className="rp-stack">{vars.map(v=><article key={v.id} className="rp-card"><div className="rp-chead"><strong>{v.key}</strong><span className="rp-pill idle">{v.type}</span></div><p className="rp-sub">Targets: {v.targets.join(', ')||'—'}{v.comment?` · ${v.comment}`:''}</p><div className="rp-bar"><button className="btn" onClick={()=>edit(v)}>Edit / rotate</button><button className="btn danger" disabled={busy} onClick={()=>void remove(v)}>Delete</button></div></article>)}</div>}</div>
  </section>;
}
