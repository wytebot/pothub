import { randomUUID } from 'node:crypto';
import { adminApp } from './adminApp';
import { getFirestore } from 'firebase-admin/firestore';
import { claimNextJob, run } from './jobs';

const workerId = `pothub-worker-${randomUUID()}`;
const db = getFirestore(adminApp());
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log(`Pothub durable worker started: ${workerId}`);
  for (;;) {
    try {
      const claimed = await claimNextJob(workerId);
      if (!claimed) { await pause(1500); continue; }
      const { job, input } = claimed;
      const heartbeat = setInterval(() => {
        job.leaseUntil = Date.now() + 90_000;
        void db.runTransaction(async tx => { const ref = db.doc(`jobs/${job.id}`); const snap = await tx.get(ref); if (snap.data()?.status === 'cancelled') job.ctl.abort(); else tx.update(ref, { leaseOwner: workerId, leaseUntil: job.leaseUntil, updatedAt: Date.now() }); }).catch(() => undefined);
      }, 20_000);
      const deadline = setTimeout(() => job.ctl.abort(), 48 * 60 * 60 * 1000); deadline.unref();
      try { await run(job, input); }
      finally { clearTimeout(deadline); clearInterval(heartbeat); input.secret = ''; await db.doc(`jobs/${job.id}`).update({ leaseOwner: null, leaseUntil: null, encryptedPayload: null }).catch(() => undefined); }
    } catch (err) { console.error('worker cycle error', err instanceof Error ? err.message : 'unknown'); await pause(3000); }
  }
}
void main();
