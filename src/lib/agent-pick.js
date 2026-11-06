import {db} from './db';

const KEY='picked-agents';

/** {Chat:'agent-id', Image:'agent-id', ...} — the provider the user picked per function in the chat area. */
export async function getPickedAgents(){try{const row=await db.settings.get(KEY);return row?.value&&typeof row.value==='object'?row.value:{}}catch{return {}}}
export async function setPickedAgent(fn,id){const next={...(await getPickedAgents())};if(id===null||id===undefined||id==='')delete next[fn];else next[fn]=String(id);await db.settings.put({key:KEY,value:next,updatedAt:Date.now()});return next}
export async function clearPickedAgents(){await db.settings.put({key:KEY,value:{},updatedAt:Date.now()});return {}}
