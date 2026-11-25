import { createHash } from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from './adminApp';

const db = () => getFirestore(adminApp());
const tokenId = (token: string) => createHash('sha256').update(token).digest('hex');
export async function registerPushToken(uid: string, token: string, platform: string): Promise<void> {
  await db().doc(`pushTokens/${uid}/tokens/${tokenId(token)}`).set({ token, platform, updatedAt: Date.now() }, { merge: true });
}
export async function removePushToken(uid: string, token: string): Promise<void> {
  await db().doc(`pushTokens/${uid}/tokens/${tokenId(token)}`).delete().catch(() => undefined);
}
export async function sendJobNotification(uid: string, jobId: string, provider: string, model: string): Promise<void> {
  const snap = await db().collection(`pushTokens/${uid}/tokens`).get();
  if (snap.empty) return;
  const title = 'Your Pothub answer is ready';
  const body = `${provider} · ${model} finished your request.`;
  for (const doc of snap.docs) {
    const token = String(doc.data().token ?? ''); if (!token) continue;
    try {
      await getMessaging(adminApp()).send({ token, notification: { title, body }, data: { route: '/', jobId }, webpush: { notification: { title, body, icon: '/icon-192.png', badge: '/icon-192.png', tag: `pothub-job-${jobId}`, renotify: false }, fcmOptions: { link: `${process.env.APP_ORIGIN ?? 'https://pothub-self.vercel.app'}/#/?job=${encodeURIComponent(jobId)}` } } });
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (/registration-token-not-registered|invalid-registration-token/i.test(code)) await doc.ref.delete().catch(() => undefined);
    }
  }
}
export async function sendBuildNotification(uid:string,repo:string,conclusion:string,branch:string,runUrl:string){
  const snap=await db().collection(`pushTokens/${uid}/tokens`).get();if(snap.empty)return;
  const succeeded=conclusion==='success';const title=succeeded?'Build succeeded':'Build failed';const body=`${repo} · ${branch} · ${succeeded?'Deployment checks passed':'Needs attention'}`;
  for(const doc of snap.docs){const token=String(doc.data().token||'');if(!token)continue;try{await getMessaging(adminApp()).send({token,notification:{title,body},data:{route:'/',repo,runUrl,conclusion},webpush:{notification:{title,body,icon:'/icon-192.png',badge:'/icon-192.png',tag:`pothub-build-${repo}-${branch}`,renotify:false},fcmOptions:{link:runUrl}}})}catch(e){const code=(e as {code?:string}).code||'';if(/registration-token-not-registered|invalid-registration-token/i.test(code))await doc.ref.delete().catch(()=>undefined)}}
}
