import crypto from 'node:crypto';

/** express-rate-limit Store backed by Firestore so counters are shared by Vercel instances. */
export class FirestoreRateLimitStore {
  constructor({getFirestore=()=>null,prefix='pothub:rate:',windowMs=60000}={}){this.getFirestore=getFirestore;this.prefix=prefix;this.windowMs=windowMs;}
  init(options){if(Number(options?.windowMs)>0)this.windowMs=Number(options.windowMs);}
  _db(){const db=this.getFirestore();if(!db)throw new Error('Shared rate limiting requires Firestore.');return db;}
  _ref(key){const db=this._db(),id=crypto.createHash('sha256').update(`${this.prefix}${key}`).digest('hex');return db.collection('rate_limits').doc(id);}
  async increment(key){const ref=this._ref(key),now=Date.now();return this._db().runTransaction(async tx=>{const snap=await tx.get(ref),row=snap.exists?snap.data():{},reset=Number(row.resetAt||0);let totalHits=Number(row.count||0),resetTime;if(!reset||reset<=now){totalHits=1;resetTime=new Date(now+this.windowMs);tx.set(ref,{count:1,resetAt:resetTime,prefix:this.prefix,updatedAt:new Date(now)})}else{totalHits+=1;resetTime=new Date(reset);tx.update(ref,{count:totalHits,updatedAt:new Date(now)})}return{totalHits,resetTime};});}
  async decrement(key){const ref=this._ref(key);await this._db().runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)return;const count=Math.max(0,Number(snap.get('count')||0)-1);tx.update(ref,{count,updatedAt:new Date()})});}
  async resetKey(key){await this._ref(key).delete();}
  async resetAll(){const db=this._db();const snap=await db.collection('rate_limits').where('prefix','==',this.prefix).limit(500).get();const batch=db.batch();for(const doc of snap.docs)batch.delete(doc.ref);await batch.commit();}
}
