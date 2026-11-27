import { useState } from 'react';
import { requestSite } from '../security/api';
import type { Tag } from '../repo/tags';

const nativeChoices = [
  ['camera','Camera capture'], ['location','Location/GPS'], ['push','Push notifications'],
  ['local-notifications','Local notifications/reminders'], ['biometrics','Biometric unlock'],
  ['files','Native file access'], ['share','Native share sheet'], ['haptics','Haptic feedback'],
  ['network','Network status'], ['clipboard','Clipboard access'], ['auth-audit','Native sign-in/auth configuration check'],
] as const;
const qualityChoices = [
  ['tests','Run tests'], ['lint','Lint and type checks'], ['release','Release APK'],
  ['debug','Debug APK'], ['audit','Dependency audit (Node)'], ['mapping','Symbols / mapping files'], ['signing','Use existing release signing config'],
] as const;
export type BuildDispatchResult = {status?:string;message?:string;workflowUrl?:string;runUrl?:string;repository?:string;projectType?:string;output?:string};
export function BuildRequestDialog({tags,prompt,onClose,onQueued}:{tags:Tag[];prompt:string;onClose:()=>void;onQueued:(result:BuildDispatchResult)=>void}){
 const [output,setOutput]=useState('apk-and-aab'); const [framework,setFramework]=useState('auto'); const [native,setNative]=useState<string[]>([]); const [quality,setQuality]=useState<string[]>(['tests','lint','release','debug','audit']); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
 const flip=(list:string[],v:string,set:(s:string[])=>void)=>set(list.includes(v)?list.filter(x=>x!==v):[...list,v]);
 const dispatch=async()=>{if(!tags.length){setError('Tag a repository using @ in the chat composer before building.');return;}if(output==='apk-and-aab'&&!quality.includes('release')){setError('APK + AAB output requires Release APK to be enabled in quality preferences.');return;}if(output==='apk'&&!quality.some(x=>x==='release'||x==='debug')){setError('Select Debug APK or Release APK in quality preferences.');return;}setBusy(true);setError('');try{const r=await requestSite<BuildDispatchResult>('/api/forge',{repository:tags[0].repo,repositoryUrl:`https://github.com/${tags[0].repo}`,ref:'',projectType:framework,output,nativeFeatures:native,qualityOptions:quality,requestSummary:prompt.trim().slice(0,4000)||'Chat-requested cloud build'});onQueued(r);}catch(e){setError(e instanceof Error?e.message:'Build dispatch failed. Check GitHub connection and try again.');}finally{setBusy(false);}};
 return <div className="build-request-overlay" role="dialog" aria-modal="true" aria-label="Build Android package"><div className="build-request-card"><header><div><span className="eyebrow">CLOUD ANDROID BUILD</span><h2>Build APK / AAB</h2><p className="muted">Runs on GitHub-hosted workers. You can close MonyGist while the build runs.</p></div><button className="ia" onClick={onClose} aria-label="Close build options">×</button></header>
 <div className="build-target"><strong>Repository</strong><span>{tags[0]?.repo||'No repository tagged'}</span><small>Source ref: repository default branch</small></div>
 <fieldset><legend>Project framework</legend><div className="build-pill-row">{[['auto','Auto detect'],['capacitor','Capacitor'],['react-native','React Native'],['android','Native Android'],['flutter','Flutter']].map(([v,l])=><button type="button" className={`build-choice ${framework===v?'selected':''}`} key={v} onClick={()=>setFramework(v)}>{l}</button>)}</div></fieldset><fieldset><legend>Build output</legend><div className="build-pill-row">{[['apk','APK'],['apk-and-aab','APK + AAB (recommended)'],['web','Web']].map(([v,l])=><button type="button" className={`build-choice ${output===v?'selected':''}`} key={v} onClick={()=>setOutput(v)}>{l}</button>)}</div></fieldset>
 <fieldset><legend>Native features to wire (Capacitor)</legend><div className="build-check-grid">{nativeChoices.map(([id,label])=><label key={id}><input type="checkbox" checked={native.includes(id)} onChange={()=>flip(native,id,setNative)}/>{label}</label>)}</div></fieldset>{output==='web'&&<p className="small muted">Native capability selections apply only to Android builds; they will be ignored for Web output.</p>}
 <fieldset><legend>Quality preferences</legend><div className="build-check-grid">{qualityChoices.map(([id,label])=><label key={id}><input type="checkbox" checked={quality.includes(id)} onChange={()=>flip(quality,id,setQuality)}/>{label}</label>)}</div></fieldset>
 <p className="small muted">For Capacitor, native feature checkboxes install compatible plugins, add Android permissions and generate a callable helper bridge. Flutter and native Gradle projects receive an API/sign-in audit but do not get incompatible plugin injection. The project still needs app-specific screens and consent UX. Release signing uses existing project configuration only.</p>{error&&<div className="notice error" role="alert">{error}</div>}<footer><button className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" onClick={()=>void dispatch()} disabled={busy||!tags.length}>{busy?'Queuing build…':'Queue cloud build'}</button></footer></div></div>;
}
