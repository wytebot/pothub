import crypto from 'node:crypto';
import { sealData, unsealData } from '@hapi/iron';
import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { grantDocumentId } from './billing-safety.js';

function initFirebaseAdmin(){
  if(getApps().length) return getApps()[0];
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(raw){
    const parsed=JSON.parse(raw);
    initializeApp({credential:cert(parsed), ...(process.env.FIREBASE_PROJECT_ID?{projectId:process.env.FIREBASE_PROJECT_ID}:{})});
  } else {
    initializeApp({credential:applicationDefault(), ...(process.env.FIREBASE_PROJECT_ID?{projectId:process.env.FIREBASE_PROJECT_ID}:{})});
  }
  return getApps()[0];
}
let firestoreInstance=null, firebaseInitError=null;
try { initFirebaseAdmin(); firestoreInstance=getFirestore(); } catch(e) { firebaseInitError=e; }
export const firestore=firestoreInstance;
export const databaseReady=!!firestoreInstance;
export function databaseError(){return firebaseInitError;}

const primaryKeys={profiles:'github_id',credit_orders:'reference',credit_ledger:'id',repair_tasks:'id'};
function docId(table,row){
  const k=primaryKeys[table]||'id';
  if(row[k]!==undefined&&row[k]!==null) return String(row[k]);
  return crypto.randomUUID();
}
function clean(value){const out={...value};delete out._id;delete out._table;return out;}
class Query {
  constructor(table){this.table=table;this.filters=[];this.sort=null;this.max=null;this.projection=null;this.action='select';this.payload=null;this.conflict=null;this.single=false;}
  select(fields='*'){this.projection=fields==='*'?null:String(fields).split(',').map(x=>x.trim());return this;}
  eq(k,v){this.filters.push([k,'==',v]);return this;}
  gt(k,v){this.filters.push([k,'>',v]);return this;}
  order(k,{ascending=true}={}){this.sort=[k,ascending?'asc':'desc'];return this;}
  limit(n){this.max=n;return this;}
  maybeSingle(){this.single=true;return this;}
  insert(value){this.action='insert';this.payload=value;return this;}
  upsert(value,{onConflict}={}){this.action='upsert';this.payload=value;this.conflict=onConflict;return this;}
  update(value){this.action='update';this.payload=value;return this;}
  delete(){this.action='delete';return this;}
  async execute(){
    if(!firestoreInstance) return {data:null,error:new Error('Firebase Admin/Firestore is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or configure Application Default Credentials.')};
    try {
      const col=firestoreInstance.collection(this.table);
      if(this.action==='insert'||this.action==='upsert'){
        const rows=Array.isArray(this.payload)?this.payload:[this.payload]; const results=[];
        for(const row0 of rows){const row={...row0};const id=docId(this.table,row);const ref=col.doc(id);if(this.action==='insert'&&(await ref.get()).exists)return {data:null,error:Object.assign(new Error('Duplicate record.'),{code:'already-exists'})};
          if(this.action==='upsert') await ref.set(row,{merge:true}); else await ref.create(row);results.push({...row});}
        return {data:Array.isArray(this.payload)?results:results[0],error:null};
      }
      let q=col; for(const [k,op,v] of this.filters) q=q.where(k,op,v);
      if(this.sort) q=q.orderBy(this.sort[0],this.sort[1]); if(this.max!==null) q=q.limit(this.max);
      const snap=await q.get(); const docs=snap.docs;
      if(this.action==='select'){
        const rows=docs.map(d=>({...d.data(),_id:d.id})).map(row=>{delete row._id;return row;}).map(row=>this.projection?Object.fromEntries(this.projection.filter(k=>k in row).map(k=>[k,row[k]])):row);
        return {data:this.single?(rows[0]||null):rows,error:null};
      }
      if(this.action==='update'){
        const batch=firestoreInstance.batch(); for(const d of docs) batch.set(d.ref,this.payload,{merge:true}); await batch.commit(); return {data:docs.map(d=>({...d.data(),...this.payload})),error:null};
      }
      if(this.action==='delete'){
        const batch=firestoreInstance.batch();for(const d of docs)batch.delete(d.ref);await batch.commit();return {data:docs.map(d=>d.data()),error:null};
      }
      return {data:null,error:new Error('Unsupported database operation.')};
    } catch(error){return {data:null,error};}
  }
  then(resolve,reject){return this.execute().then(resolve,reject);}
}
class FirebaseDatabase {
  from(table){return new Query(table);}
  async rpc(name,args={}){
    if(!firestoreInstance)return {data:null,error:new Error('Firebase Firestore is not configured.')};
    try{
      const db=firestoreInstance;
      if(name==='initialize_profile'){
        const id=String(args.p_github_id),ref=db.collection('profiles').doc(id),hash=String(args.p_device_hash||'');
        const result=await db.runTransaction(async tx=>{
          const existing=await tx.get(ref);let duplicate=false;
          if(hash){const d=await tx.get(db.collection('device_claims').doc(crypto.createHash('sha256').update(hash).digest('hex')));duplicate=d.exists&&d.data().github_id!==id;}
          if(existing.exists){const old=existing.data();const update={github_login:args.p_github_login,display_name:args.p_display_name,email:args.p_email||null,avatar_url:args.p_avatar_url||null,updated_at:new Date().toISOString()};if(duplicate){update.credits=Math.max(0,Number(old.credits||0)-Number(old.starter_credits_remaining||0));update.starter_credits_remaining=0;}tx.set(ref,update,{merge:true});return {ok:true,credits:duplicate?Math.max(0,Number(old.credits||0)-Number(old.starter_credits_remaining||0)):Number(old.credits||0),duplicate_device:duplicate};}
          const credits=duplicate?0:5;tx.create(ref,{github_id:id,github_login:args.p_github_login,display_name:args.p_display_name,email:args.p_email||null,avatar_url:args.p_avatar_url||null,device_hash:duplicate?null:(hash||null),credits,starter_credits_remaining:credits,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
          if(hash&&!duplicate)tx.set(db.collection('device_claims').doc(crypto.createHash('sha256').update(hash).digest('hex')),{github_id:id,created_at:new Date().toISOString()});return {ok:true,credits,duplicate_device:duplicate};
        });return {data:result,error:null};
      }
      if(name==='spend_credits'){
        const id=String(args.p_github_id),amount=Number(args.p_amount);if(!Number.isSafeInteger(amount)||amount<=0)return {data:{ok:false,message:'Invalid credit amount.'},error:null};
        const result=await db.runTransaction(async tx=>{const ref=db.collection('profiles').doc(id),snap=await tx.get(ref);if(!snap.exists)return {ok:false,message:'Profile is not initialized.'};const p=snap.data(),balance=Number(p.credits||0);if(balance<amount)return {ok:false,message:'Not enough credits.'};const next=balance-amount,now=new Date().toISOString(),starter=Math.max(0,Number(p.starter_credits_remaining||0)-Math.min(Number(p.starter_credits_remaining||0),amount));tx.update(ref,{credits:next,starter_credits_remaining:starter,updated_at:now});const led=db.collection('credit_ledger').doc();tx.create(led,{github_id:id,delta:-amount,balance_after:next,reason:String(args.p_reason||'AI operation'),metadata:args.p_metadata||{},created_at:now});return {ok:true,credits:next};});return {data:result,error:null};
      }
      if(name==='spend_credits_once'){
        const id=String(args.p_github_id),amount=Number(args.p_amount),reference=String(args.p_reference||'');
        if(!Number.isSafeInteger(amount)||amount<=0||reference.length<5||reference.length>180)return {data:{ok:false,message:'Invalid credit charge reference.'},error:null};
        const chargeId=grantDocumentId(id,`spend:${reference}`);
        const result=await db.runTransaction(async tx=>{const profile=db.collection('profiles').doc(id),charge=db.collection('credit_spends').doc(chargeId);const [pref,chargeSnap]=await Promise.all([tx.get(profile),tx.get(charge)]);if(!pref.exists)return {ok:false,message:'Profile is not initialized.'};if(chargeSnap.exists)return {ok:true,duplicate:true,credits:Number(pref.data().credits||0)};const p=pref.data(),balance=Number(p.credits||0);if(balance<amount)return {ok:false,message:'Not enough credits.'};const next=balance-amount,now=new Date().toISOString();tx.update(profile,{credits:next,starter_credits_remaining:Math.max(0,Number(p.starter_credits_remaining||0)-Math.min(Number(p.starter_credits_remaining||0),amount)),updated_at:now});tx.create(charge,{github_id:id,reference,amount,reason:String(args.p_reason||'AI operation'),created_at:now});tx.create(db.collection('credit_ledger').doc(chargeId),{github_id:id,delta:-amount,balance_after:next,reason:String(args.p_reason||'AI operation'),reference,charge_id:chargeId,metadata:args.p_metadata||{},created_at:now});return {ok:true,duplicate:false,credits:next};});return {data:result,error:null};
      }
      if(name==='grant_credits'){
        const id=String(args.p_github_id),amount=Number(args.p_amount),reference=String(args.p_reference||'');
        if(!Number.isSafeInteger(amount)||amount<=0||reference.length<5||reference.length>180)return {data:null,error:new Error('Invalid credit grant.')};
        // Deterministic grant marker prevents duplicate webhook/verify requests from
        // granting twice, without depending on a composite Firestore query/index.
        const grantId=grantDocumentId(id,reference);
        const result=await db.runTransaction(async tx=>{
          const profile=db.collection('profiles').doc(id),grant=db.collection('credit_grants').doc(grantId);
          const [pref,grantSnap]=await Promise.all([tx.get(profile),tx.get(grant)]);
          if(!pref.exists)throw new Error('Profile not found.');
          if(grantSnap.exists)return {ok:true,duplicate:true,credits:Number(pref.data().credits||0)};
          const next=Number(pref.data().credits||0)+amount,now=new Date().toISOString();
          tx.update(profile,{credits:next,updated_at:now});
          tx.create(grant,{github_id:id,reference,amount,reason:String(args.p_reason||'Credit pack purchase'),created_at:now});
          tx.create(db.collection('credit_ledger').doc(grantId),{github_id:id,delta:amount,balance_after:next,reason:String(args.p_reason||'Credit pack purchase'),reference,grant_id:grantId,metadata:{},created_at:now});
          return {ok:true,duplicate:false,credits:next};
        });return {data:result,error:null};
      }
      return {data:null,error:new Error(`Unsupported database operation: ${name}`)};
    }catch(error){return {data:null,error};}
  }
}
export const db=new FirebaseDatabase();
export const flwBase=process.env.FLW_MODE==='production'?'https://api.flutterwave.cloud':'https://developersandbox-api.flutterwave.com';
export function origin(req){
  // Never trust an arbitrary Host or forwarded-host header for OAuth/payment redirects.
  const configured=process.env.APP_URL;
  if(configured){let u;try{u=new URL(configured)}catch{throw Error('APP_URL must be a valid absolute URL.')}if(process.env.NODE_ENV==='production'&&u.protocol!=='https:')throw Error('APP_URL must use HTTPS in production.');return u.origin}
  const deployment=process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL;
  if(deployment){const host=String(deployment).replace(/^https?:\/\//,'').split('/')[0];if(!/^[a-z0-9.-]+$/i.test(host))throw Error('Vercel deployment hostname is invalid.');return `https://${host}`}
  return 'https://ai.pothub.app';
}
export function randomRef(p='fp'){return `${p}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`}
const secure=()=>process.env.NODE_ENV==='production'?'; Secure':'';
export async function setSession(res,data){if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw Error('SESSION_SECRET must be at least 32 characters.');const value=await sealData({...data,kind:'session'},{password:process.env.SESSION_SECRET,ttl:7*24*60*60*1000});res.append('Set-Cookie',`kithub_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure()}`)}
export async function getSession(req){try{if(!process.env.SESSION_SECRET)return null;const auth=String(req.headers.authorization||'');if(auth.startsWith('Bearer ')){const d=await unsealData(auth.slice(7),{password:process.env.SESSION_SECRET,ttl:7*24*60*60*1000});return d.kind==='session'?d:null}const c=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('kithub_session='));if(!c)return null;const d=await unsealData(decodeURIComponent(c.slice('kithub_session='.length)),{password:process.env.SESSION_SECRET,ttl:7*24*60*60*1000});return d.kind==='session'?d:null}catch{return null}}
export function clearSession(res){res.append('Set-Cookie',`kithub_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`)}
export function redactSecrets(t=''){return String(t).slice(0,25000).replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g,'[REDACTED_GITHUB_TOKEN]').replace(/AIza[0-9A-Za-z_-]{30,}/g,'[REDACTED_GOOGLE_KEY]').replace(/FLWSECK[^\s"']+/g,'[REDACTED_FLUTTERWAVE_KEY]').replace(/(Bearer\s+)[A-Za-z0-9._-]{20,}/gi,'$1[REDACTED]').replace(/((?:password|secret|token|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]')}
export async function requireUser(req,res){const s=await getSession(req);if(!s?.user?.id||(!s?.githubToken&&s?.authProvider!=='google')){res.status(401).json({error:'Sign in to Pothub to continue.'});return null}return s}
export async function getCredits(id){if(!databaseReady)throw Error('Credit accounting is unavailable. Configure Firebase Admin and Firestore.');const{data,error}=await db.from('profiles').select('credits').eq('github_id',String(id)).maybeSingle();if(error)throw error;if(!data)throw Error('Your Pothub profile is not initialized. Sign out and reconnect GitHub.');return{credits:Number(data.credits||0),demo:false}}
export async function spendCredits(id,amount,reason,metadata={}){if(!databaseReady)throw Error('Credit accounting is unavailable. Firebase Firestore is not configured.');const{data,error}=await db.rpc('spend_credits',{p_github_id:String(id),p_amount:amount,p_reason:reason,p_metadata:metadata});if(error)throw Error(error.message||'Unable to reserve credits.');if(!data?.ok)throw Error(data?.message||'Not enough credits.');return{credits:Number(data.credits),demo:false}}
export async function spendCreditsOnce(id,amount,reference,reason='AI operation',metadata={}){if(!databaseReady)throw Error('Credit accounting is unavailable. Firebase Firestore is not configured.');const{data,error}=await db.rpc('spend_credits_once',{p_github_id:String(id),p_amount:amount,p_reference:String(reference),p_reason:reason,p_metadata:metadata});if(error)throw Error(error.message||'Unable to charge credits.');if(!data?.ok)throw Error(data?.message||'Not enough credits.');return{credits:Number(data.credits),duplicate:!!data.duplicate,demo:false}}
export async function addCredits(id,amount,reference,reason='Credit pack purchase'){if(!databaseReady)throw Error('Configure Firebase Firestore before enabling real credit purchases.');const{data,error}=await db.rpc('grant_credits',{p_github_id:String(id),p_amount:amount,p_reference:String(reference),p_reason:reason});if(error)throw Error(error.message||'Unable to grant credits.');return data}
let flwCachedToken='',flwTokenExpiresAt=0,flwTokenPromise=null;
export async function flwToken(){
  if(!process.env.FLW_CLIENT_ID||!process.env.FLW_CLIENT_SECRET)throw Error('Flutterwave v4 credentials are not configured.');
  if(flwCachedToken&&flwTokenExpiresAt>Date.now()+30000)return flwCachedToken;
  if(flwTokenPromise)return flwTokenPromise;
  flwTokenPromise=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const r=await fetch('https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.FLW_CLIENT_ID,client_secret:process.env.FLW_CLIENT_SECRET,grant_type:'client_credentials'})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw Error('Flutterwave v4 authentication failed. Check credentials and environment.');flwCachedToken=d.access_token;flwTokenExpiresAt=Date.now()+Math.max(60,Number(d.expires_in)||300)*1000;return flwCachedToken;}catch(e){if(e.name==='AbortError')throw Error('Flutterwave authentication timed out. Please retry.');throw e;}finally{clearTimeout(timer);flwTokenPromise=null;}})();return flwTokenPromise;
}
export async function flwFetch(path,token,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);try{const r=await fetch(`${flwBase}${path}`,{...options,signal:controller.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Trace-Id':randomRef('trace'),'X-Idempotency-Key':randomRef('idem'),...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||d.error||`Flutterwave v4 returned ${r.status}`);return d;}catch(e){if(e.name==='AbortError')throw Error('Flutterwave request timed out. Verify the payment status before retrying.');throw e;}finally{clearTimeout(timer)}}
