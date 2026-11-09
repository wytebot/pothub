import {db} from './db';

/** Label given to every agent created from the Vercel Backend page. */
export const BACKEND_LABEL='Vercel Backend';
const KEY='vercel-backend-mode';

export const isBackendAgent=a=>String(a?.label||'')===BACKEND_LABEL&&String(a?.provider||'').toLowerCase().replace(/[_\s]+/g,'-')==='openai-compatible';

/** null = never chosen, true/false = explicit choice. */
export async function backendModeStored(){try{const r=await db.settings.get(KEY);return r?.value&&typeof r.value.enabled==='boolean'?r.value.enabled:null}catch{return null}}
export async function backendModeEnabled(){return (await backendModeStored())===true}
export async function setBackendMode(enabled){await db.settings.put({key:KEY,value:{enabled:!!enabled,updatedAt:Date.now()}})}

/**
 * Which agents may serve a request while "Vercel backend only" is on.
 * Only Vercel Backend agents qualify (direct provider agents are never returned).
 * Ticked (default) agents are used in saved order; with none ticked, every backend agent is eligible.
 */
export function pickBackendAgents(rows){
  const all=(Array.isArray(rows)?rows:[]).filter(isBackendAgent);
  const ticked=all.filter(a=>a.default);
  return ticked.length?ticked:all;
}
export const orderByDefault=rows=>[...rows].sort((a,b)=>Number(!!b.default)-Number(!!a.default));
