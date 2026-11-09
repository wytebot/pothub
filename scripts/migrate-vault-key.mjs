import crypto from 'node:crypto';
import { firestore, ensureDatabase } from '../server/lib.js';

const oldSecret=String(process.env.SESSION_SECRET||'');
const newSecret=String(process.env.POTHUB_VAULT_ENCRYPTION_KEY||'').trim();
if(oldSecret.length<32)throw new Error('SESSION_SECRET is required to decrypt the legacy vault.');
if(!/^[a-f0-9]{64}$/i.test(newSecret))throw new Error('POTHUB_VAULT_ENCRYPTION_KEY must be 64 hexadecimal characters.');
if(!ensureDatabase()||!firestore)throw new Error('Firebase Admin/Firestore is unavailable. Configure FIREBASE_SERVICE_ACCOUNT_JSON or ADC.');
const legacyKey=crypto.createHash('sha256').update(oldSecret).digest();
const newKey=Buffer.from(newSecret,'hex');
function decryptLegacy(row){const v=row?.secretEncrypted;if(!v||v.v!==1)return null;const d=crypto.createDecipheriv('aes-256-gcm',legacyKey,Buffer.from(v.iv,'base64'));d.setAuthTag(Buffer.from(v.tag,'base64'));return Buffer.concat([d.update(Buffer.from(v.data,'base64')),d.final()]).toString('utf8')}
function encryptNew(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',newKey,iv),data=Buffer.concat([c.update(value,'utf8'),c.final()]);return {v:1,iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')}}
const snap=await firestore.collectionGroup('items').where('table','==','agents').get();const updates=[];let skipped=0;
for(const doc of snap.docs){const row=doc.data(),payload=row.payload||{};if(!payload.secretEncrypted){skipped++;continue}const plain=decryptLegacy(payload);if(plain===null){skipped++;continue}updates.push({ref:doc.ref,payload:{...payload,secretEncrypted:encryptNew(plain)}})}
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',scanned:snap.size,willMigrate:updates.length,skipped,warning:'No secret values are printed.'}));
if(!process.argv.includes('--apply')){console.log('Dry run only. Review the counts, back up Firestore, then rerun with --apply.');process.exit(0)}
for(let offset=0;offset<updates.length;offset+=400){const batch=firestore.batch();for(const item of updates.slice(offset,offset+400))batch.update(item.ref,{payload:item.payload,updatedAt:new Date().toISOString()});await batch.commit()}
console.log(`Migrated ${updates.length} encrypted agent records. Keep the old SESSION_SECRET unchanged; set the new dedicated vault key and redeploy only after this completes.`);
