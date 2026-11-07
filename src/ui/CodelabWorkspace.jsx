import React,{useEffect,useMemo} from 'react';
import Codelab from './codelab/Codelab';
import {setCodelabApi,setCodelabContext} from './codelab/bridge';

// Codelab is the WyteLab workspace running on PotHub's own session, credits and chat.
// section: 'codelab' (WyteLab Home) or 'codelab:<page>' for every other WyteLab page.
export const CODELAB_PAGES=['home','repos','recent','changes','actions','github','logs','billing','search','settings','help','privacy','terms','about','contact','vercel','project'];
export const pageFromSection=s=>{const p=String(s||'').split(':')[1]||'home';return CODELAB_PAGES.includes(p)?p:'home'};
export const sectionFromPage=p=>!p||p==='home'?'codelab':`codelab:${p}`;

export default function CodelabWorkspace({api,user,section,setSection,onMenu,onOpenAI,onRepoChange,credits,planLabel,onOpenCredits,theme}){
  useEffect(()=>{setCodelabApi(api)},[api]);
  useEffect(()=>{setCodelabContext({openAI:onOpenAI,openCredits:onOpenCredits,openMenu:onMenu,onRepo:onRepoChange,credits,planLabel})},[onOpenAI,onOpenCredits,onMenu,onRepoChange,credits,planLabel]);
  const account=useMemo(()=>user?{id:user.id,login:user.login,name:user.name}:null,[user?.id,user?.login,user?.name]);
  const page=pageFromSection(section);
  // Legal pages that WyteLab opened as separate documents are rendered in-app here.
  return <div className="wl-root" data-theme={theme}><Codelab account={account} page={page} onNavigate={p=>setSection(sectionFromPage(p))} onMenu={onMenu}/></div>;
}
