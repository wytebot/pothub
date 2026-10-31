import crypto from 'node:crypto';
export async function acquireFirestoreLease(store,collection,key,owner=crypto.randomUUID(),leaseMs=25000){
  const ref=store.collection(collection).doc(String(key));
  const acquired=await store.runTransaction(async tx=>{const snap=await tx.get(ref),row=snap.exists?snap.data():{},expiry=typeof row.expiresAt?.toMillis==='function'?row.expiresAt.toMillis():Number(row.expiresAt||0);if(!snap.exists||expiry<Date.now()||row.owner===owner){tx.set(ref,{owner,expiresAt:new Date(Date.now()+leaseMs),updatedAt:new Date()},{merge:true});return true;}return false;});
  return {acquired,ref,owner};
}
export async function releaseFirestoreLease(store,lease){if(!lease?.ref||!lease.owner)return false;return store.runTransaction(async tx=>{const snap=await tx.get(lease.ref);if(snap.exists&&snap.data().owner===lease.owner){tx.delete(lease.ref);return true;}return false;});}
