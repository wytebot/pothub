import { randomUUID } from 'node:crypto';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFunctions } from 'firebase-admin/functions';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '../../server/src/adminApp';
import { claimJobById, run, runAgent } from '../../server/src/jobs';
import { sendJobNotification } from '../../server/src/push';

const REGION = process.env.FUNCTION_REGION || 'us-central1';
const db = getFirestore(adminApp());
const queue = () => getFunctions(adminApp(), REGION).taskQueue('processPothubJob');

/** Enqueue only an identifier. The encrypted provider payload stays in Firestore. */
export const enqueuePothubJob = onDocumentCreated({
  document: 'jobs/{jobId}',
  region: REGION,
  retry: true,
  memory: '256MiB',
  maxInstances: 20,
}, async (event) => {
  const jobId = event.params.jobId;
  if (!event.data || event.data.data().status !== 'queued') return;
  await queue().enqueue({ jobId }, { dispatchDeadlineSeconds: 1800 });
});

/** Re-enqueue abandoned queued jobs and jobs whose worker lease expired after a crash. */
export const recoverPothubJobs = onSchedule({
  schedule: 'every 2 minutes',
  region: REGION,
  memory: '256MiB',
  maxInstances: 1,
}, async () => {
  const now = Date.now();
  const [queued, running] = await Promise.all([
    db.collection('jobs').where('status', '==', 'queued').limit(100).get(),
    db.collection('jobs').where('status', '==', 'running').limit(100).get(),
  ]);
  const candidates = [
    ...queued.docs,
    ...running.docs.filter((doc) => Number(doc.data().leaseUntil ?? 0) <= now),
  ].slice(0, 100);
  await Promise.all(candidates.map(async (doc) => {
    const shouldDispatch = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const data = fresh.data();
      if (!data || !['queued', 'running'].includes(String(data.status))) return false;
      if (data.status === 'running' && Number(data.leaseUntil ?? 0) > now) return false;
      const last = Number(data.recoveryDispatchAt ?? 0);
      if (now - last < 90_000) return false;
      tx.update(doc.ref, { recoveryDispatchAt: now });
      return true;
    });
    if (shouldDispatch) await queue().enqueue({ jobId: doc.id }, { dispatchDeadlineSeconds: 1800 });
  }));
});

/** Durable, at-least-once task execution with a Firestore lease for idempotency. */
export const processPothubJob = onTaskDispatched({
  region: REGION,
  memory: '1GiB',
  secrets: ['BACKGROUND_JOB_ENCRYPTION_KEY'],
  timeoutSeconds: 1800,
  maxInstances: 20,
  concurrency: 1,
  retryConfig: { maxAttempts: 8, minBackoffSeconds: 10, maxBackoffSeconds: 300, maxDoublings: 5 },
  rateLimits: { maxConcurrentDispatches: 10, maxDispatchesPerSecond: 2 },
}, async (request) => {
  const jobId = typeof request.data?.jobId === 'string' ? request.data.jobId : '';
  if (!jobId) throw new Error('Missing jobId.');
  const workerId = `firebase-task-${randomUUID()}`;
  const claimed = await claimJobById(jobId, workerId);
  if (!claimed) return; // Already complete, cancelled, or held by another live lease.
  const { job, input } = claimed;
  const heartbeat = setInterval(() => {
    job.leaseUntil = Date.now() + 90_000;
    void db.runTransaction(async (tx) => {
      const ref = db.doc(`jobs/${job.id}`);
      const snap = await tx.get(ref);
      const data = snap.data();
      if (!data || data.status === 'cancelled') {
        job.status = 'cancelled';
        job.ctl.abort();
      } else if (data.leaseOwner === workerId && data.status === 'running') {
        tx.update(ref, { leaseOwner: workerId, leaseUntil: job.leaseUntil, updatedAt: Date.now() });
      } else {
        job.ctl.abort();
      }
    }).catch(() => undefined);
  }, 20_000);
  const deadline = setTimeout(() => job.ctl.abort(), 28 * 60_000);
  try {
    if (input.mode === 'agent') await runAgent(job, input);
    else await run(job, input);
    if (job.status === 'done') await sendJobNotification(job.uid, job.id, job.provider, job.model).catch(() => undefined);
  } finally {
    clearTimeout(deadline);
    clearInterval(heartbeat);
    input.secret = '';
    await db.doc(`jobs/${job.id}`).update({ leaseOwner: null, leaseUntil: null, encryptedPayload: null }).catch(() => undefined);
  }
});
