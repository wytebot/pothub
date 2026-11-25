import {createHmac,timingSafeEqual} from 'node:crypto';
import {getFirestore} from 'firebase-admin/firestore';
import {adminApp} from './adminApp';
import {billingStatus} from './billing';
import {sendBuildNotification} from './push';
const db=()=>getFirestore(adminApp());
export async function handleGithubWebhook(raw:Buffer,signature:string|undefined,secret:string,event:string,delivery:string|undefined){
 if(!secret||!signature)throw new Error('GitHub webhook secret or signature is missing.');
 const expected=Buffer.from(`sha256=${createHmac('sha256',secret).update(raw).digest('hex')}`);const actual=Buffer.from(signature);if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new Error('Invalid GitHub webhook signature.');
 if(!delivery||delivery.length>200)throw new Error('Missing GitHub delivery identifier.');const deliveryRef=db().doc(`githubWebhookDeliveries/${delivery}`);const prior=await deliveryRef.get();if(prior.exists)return {duplicate:true};
 const body=JSON.parse(raw.toString('utf8')) as any;
 if(event!=='workflow_run'||body.action!=='completed'||!['success','failure'].includes(body.workflow_run?.conclusion)) {await deliveryRef.create({event,ignored:true,createdAt:Date.now()});return {ignored:true}}
 const repo=String(body.repository?.full_name||'');const run=body.workflow_run||{};if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error('Invalid repository in webhook payload.');
 const matches=await db().collection('doctorRepoSelections').where('repositories','array-contains',repo).get();
 await deliveryRef.create({event,repo,conclusion:run.conclusion,createdAt:Date.now()});let notified=0;
 for(const item of matches.docs){try{const uid=item.id;const status=await billingStatus({uid,email:null,emailVerified:false} as any);if(!status.premium)continue;await sendBuildNotification(uid,repo,String(run.conclusion),String(run.head_branch||''),String(run.html_url||''));notified++}catch{/* One user's notification failure must not block others. */}}
 return {received:true,notified};
}
