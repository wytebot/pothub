import { useCallback,useEffect,useState } from 'react';
import { requestSite } from '../security/api';
import { Icon } from '../ui/Icon';

type Run={id:number;title:string;status:string;conclusion:string|null;url:string;createdAt:string;branch:string;runNumber:number;attempt:number};
type Detail={id:number;title:string;status:string;conclusion:string|null;url:string;repository:string;ref:string;branch:string;createdAt:string;jobs:{id:number;name:string;status:string;conclusion:string|null;steps:{name:string;status:string;conclusion:string|null;number:number}[]}[];failedSteps:string[];error:string;log:string};
const status=(r:Run|Detail)=>r.status!=='completed'?'running':r.conclusion==='success'?'success':'failed';
export function ForgeBuildRuns(){const [runs,setRuns]=useState<Run[]>([]);const [selected,setSelected]=useState(0);const [detail,setDetail]=useState<Detail|null>(null);const [loading,setLoading]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const r=await requestSite<{runs:Run[]}>('/api/forge/runs');setRuns(r.runs||[]);setSelected(cur=>r.runs?.some(x=>x.id===cur)?cur:r.runs?.[0]?.id||0);}catch(e){setError(e instanceof Error?e.message:'Could not load cloud build runs.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!selected){setDetail(null);return;}let live=true;setBusy(true);setDetail(null);void requestSite<Detail>(`/api/forge/run?runId=${selected}`).then(d=>{if(live)setDetail(d);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Build log fetch failed.');}).finally(()=>{if(live)setBusy(false);});return()=>{live=false;};},[selected]);
 useEffect(()=>{if(!runs.some(r=>r.status!=='completed'))return;const t=setInterval(()=>void load(),10000);return()=>clearInterval(t);},[runs,load]);
 const explain=()=>{if(!detail?.repository)return;localStorage.setItem('monygist.chat.failure-draft',JSON.stringify({repo:detail.repository,branch:detail.ref==='default'?'':detail.ref,title:detail.title,error:detail.error,log:detail.log,analysis:`Cloud build failed at: ${detail.failedSteps.join('; ')||detail.error}. Log excerpt attached below. This is a log-derived failure summary, not a completed AI diagnosis.`}));location.hash='#/';};
 return <section className="forge-runs stack"><div className="row wrap between"><div><h2>Cloud build runs</h2><p className="muted small">GitHub-hosted APK/AAB and web jobs. Timeline updates automatically while runs are active.</p></div><button className="btn" disabled={loading} onClick={()=>void load()}><Icon name="refresh" size={16}/>{loading?'Refreshing…':'Refresh'}</button></div>
 {error&&<div className="notice error" role="alert">{error}</div>}
 {!runs.length&&!loading&&!error&&<div className="panel muted">No cloud build runs yet. Tag a repository in chat and request an APK/AAB build.</div>}
 {runs.length>0&&<div className="forge-run-list">{runs.map(r=><button key={r.id} className={`forge-run-item ${selected===r.id?'selected':''}`} onClick={()=>setSelected(r.id)}><span className={`forge-run-dot ${status(r)}`}/><span className="forge-run-title">{r.title}<small>#{r.runNumber} · {r.branch||'default branch'} · {new Date(r.createdAt).toLocaleString()}</small></span><span className={`forge-run-state ${status(r)}`}>{r.status==='completed'?r.conclusion:r.status.replace('_',' ')}</span></button>)}</div>}
 {busy&&<div className="panel muted">Loading build steps and logs…</div>}
 {detail&&!busy&&<div className="panel forge-run-detail"><div className="row wrap between"><div><h3>{detail.title}</h3><p className="muted small">{detail.repository?`${detail.repository} @ ${detail.ref||detail.branch}`:'Source repository not parsed from the run title'} · {new Date(detail.createdAt).toLocaleString()}</p></div><a className="btn" href={detail.url} target="_blank" rel="noreferrer">Open run <Icon name="external-link" size={16}/></a></div>
 <div className="forge-run-jobs">{detail.jobs.map(j=><div className="forge-job" key={j.id}><h4>{j.name}</h4><ol>{j.steps.map(st=><li key={st.number} className={st.status==='in_progress'?'running':st.status!=='completed'?'pending':st.conclusion==='success'?'done':'failed'}><span>{st.status==='in_progress'?'◌':st.status!=='completed'?'○':st.conclusion==='success'?'✓':'×'}</span>{st.name}</li>)}</ol></div>)}</div>
 {detail.log&&<div><h4>Failure log excerpt</h4><pre className="forge-run-log">{detail.log}</pre></div>}
 {detail.conclusion==='failure'&&<div className="row wrap"><button className="btn primary" disabled={!detail.repository} onClick={explain}>Explain and repair in chat</button><span className="muted small">Transfers the failed run, repository tag, error and log excerpt to chat.</span></div>}
 </div>}
 </section>;
}
