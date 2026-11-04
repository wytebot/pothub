import React,{useState} from 'react';
import {Wrench,ShieldCheck,Image as ImageIcon,ArrowRight,GitBranch,CheckCircle2,Info} from 'lucide-react';

export default function GrowthLabWorkspace({role,repos=[],setRepo,setLogs,setPrompt,setImageCount,setSection,showError}){
  const [selectedRepo,setSelectedRepo]=useState('');
  const [buildLogs,setBuildLogs]=useState('');
  const [campaignPrompt,setCampaignPrompt]=useState('');
  const chosen=repos.find(r=>r.full_name===selectedRepo)||null;
  const openRescue=()=>{
    if(!chosen)return showError(new Error('Choose a repository first.'));
    if(!buildLogs.trim())return showError(new Error('Paste the failed build or runtime log first.'));
    setRepo(chosen);setLogs(buildLogs.trim());setSection('workspace');
  };
  const openCampaign=()=>{
    if(campaignPrompt.trim().length<8)return showError(new Error('Describe your campaign in at least 8 characters.'));
    setPrompt(campaignPrompt.trim());setImageCount(5);setSection('workspace');
  };
  return <section className="growth-lab-page">
    <div className="page-heading"><div><h1>Launchpad</h1><p>Turn a broken build into a reviewable repair, or prepare a creator image batch. Your configured providers do the AI work.</p></div></div>
    <div className="growth-lab-grid">
      {role==='Developer'&&<article className="panel growth-card">
        <div className="growth-card-icon"><Wrench/></div><span className="eyebrow">DEVELOPER · REPO RESCUE</span><h2>Rescue a failing build</h2><p>Choose a connected repository, paste the real error log, then continue to the existing diagnosis and repair workflow. Review proposed changes before committing.</p>
        <label>Repository<select value={selectedRepo} onChange={e=>setSelectedRepo(e.target.value)}><option value="">Choose repository…</option>{repos.map(r=><option key={r.full_name} value={r.full_name}>{r.full_name}</option>)}</select></label>
        <label>Build or runtime logs<textarea rows={5} maxLength={14000} value={buildLogs} onChange={e=>setBuildLogs(e.target.value)} placeholder="Paste the failed build output or error message…"/></label>
        <button className="primary" onClick={openRescue} disabled={!chosen||!buildLogs.trim()}><Wrench size={16}/> Continue to Repo Rescue <ArrowRight size={16}/></button>
        <small>PotHub won't claim a repair is verified unless a real check runs.</small>
      </article>}
      {role==='Creator'&&<article className="panel growth-card">
        <div className="growth-card-icon"><ImageIcon/></div><span className="eyebrow">CREATOR · CAMPAIGN FACTORY</span><h2>Prepare a 5-image batch</h2><p>Describe one product or campaign. PotHub prepares the prompt and opens Creator workspace with the batch size set to 5.</p>
        <label>Campaign brief<textarea rows={5} maxLength={4000} value={campaignPrompt} onChange={e=>setCampaignPrompt(e.target.value)} placeholder="Example: A launch campaign for a minimal black developer backpack, clean studio lighting, premium product photography…"/></label>
        <button className="primary" onClick={openCampaign} disabled={campaignPrompt.trim().length<8}><ImageIcon size={16}/> Prepare image batch <ArrowRight size={16}/></button>
        <small>Each successful agent action costs 1 PotHub credit. Each generated image and each generated file costs 1 credit; a batch of 5 images costs 5 credits. Each successfully delivered video costs 1 credit. Your provider may charge separately for API usage.</small>
      </article>}
      <article className="panel growth-card">
        <div className="growth-card-icon"><ShieldCheck/></div><span className="eyebrow">TRUST · PROVE-IT</span><h2>Review before you commit</h2><p>Use the existing repair workflow to inspect the proposed diff and verify a repair through GitHub Actions when available. Keep the default branch protected.</p>
        <ul className="growth-checklist"><li><CheckCircle2/> Inspect changed files</li><li><CheckCircle2/> Review the patch before committing</li><li><CheckCircle2/> Check real workflow results</li></ul>
        <button className="secondary" onClick={()=>setSection('workspace')}>Open workspace <ArrowRight size={16}/></button>
      </article>
    </div>
    <div className="growth-note"><Info size={17}/><span>Simple by design: Launchpad is a separate page for these focused workflows. Repository access, AI keys, credit charging, and repair safety remain in PotHub's existing services.</span></div>
  </section>;
}
