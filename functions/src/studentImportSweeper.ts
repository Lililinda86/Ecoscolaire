import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { resumeImportJob } from './studentImportRecovery';

/**
 * E1.2 - Acquire a lease on a zombie job to prevent concurrent sweeper executions.
 */
export async function acquireZombieLease(
  db: admin.firestore.Firestore,
  jobRef: admin.firestore.DocumentReference,
  sweeperId: string
): Promise<boolean> {
  return db.runTransaction(async (t) => {
    const doc = await t.get(jobRef);
    if (!doc.exists) {
      console.log(`LEASE_JOB_NOT_FOUND: JobId: ${jobRef.id}, SweeperId: ${sweeperId}`);
      return false;
    }

    const data = doc.data()!;
    const now = admin.firestore.Timestamp.now();

    // Check status
    if (data.status !== 'RUNNING' && data.status !== 'VALIDATING') {
      console.log(`LEASE_JOB_NOT_ELIGIBLE (Status): JobId: ${jobRef.id}, SchoolId: ${data.schoolId}, SweeperId: ${sweeperId}`);
      return false;
    }

    // Check age (stale > 10 min)
    const lastHeartbeat = data.lastHeartbeatAt ? data.lastHeartbeatAt.toMillis() : (data.updatedAt ? data.updatedAt.toMillis() : (data.startedAt ? data.startedAt.toMillis() : 0));
    const tenMinutesAgoMillis = now.toMillis() - 10 * 60 * 1000;
    if (!lastHeartbeat || lastHeartbeat >= tenMinutesAgoMillis) {
      console.log(`LEASE_JOB_NOT_ELIGIBLE (Recent): JobId: ${jobRef.id}, SchoolId: ${data.schoolId}, SweeperId: ${sweeperId}`);
      return false;
    }

    // Check lease
    if (data.sweeperLockedUntil && data.sweeperLockedUntil.toMillis() > now.toMillis()) {
      console.log(`LEASE_ALREADY_HELD: JobId: ${jobRef.id}, SchoolId: ${data.schoolId}, SweeperId: ${sweeperId}`);
      return false;
    }

    // Acquire lease
    const lockUntil = admin.firestore.Timestamp.fromMillis(now.toMillis() + 15 * 60 * 1000);
    t.update(jobRef, {
      sweeperLockedUntil: lockUntil,
      sweeperLockedAt: now,
      sweeperLockedBy: sweeperId
    });

    console.log(`LEASE_ACQUIRED: JobId: ${jobRef.id}, SchoolId: ${data.schoolId}, SweeperId: ${sweeperId}`);
    return true;
  });
}

export const sweepZombieImportJobs = onSchedule('every 15 minutes', async (event) => {
  const db = admin.firestore();
  console.log('Starting Zombie Sweeper Execution...');

  const limitCount = 50;
  const sweeperId = `sweeper-${Date.now()}`;
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const jobsSnap = await db.collection('student_import_jobs')
    .where('status', 'in', ['RUNNING', 'VALIDATING'])
    .limit(limitCount)
    .get();

  let scanned = 0;
  let zombiesDetected = 0;
  let skipped = 0;
  let leasesAcquired = 0;
  const recoveryPromises: Promise<any>[] = [];

  for (const doc of jobsSnap.docs) {
    scanned++;
    const data = doc.data();
    
    const lastHeartbeat = data.lastHeartbeatAt ? data.lastHeartbeatAt.toDate() : (data.updatedAt ? data.updatedAt.toDate() : (data.startedAt ? data.startedAt.toDate() : null));

    if (!lastHeartbeat) {
      skipped++;
      continue;
    }

    if (lastHeartbeat < tenMinutesAgo) {
      zombiesDetected++;
      // Attempt to acquire lease (E1.2)
      const acquired = await acquireZombieLease(db, doc.ref, sweeperId);
      if (acquired) {
        leasesAcquired++;
        // E1.3: Fire the recovery job and wait for it at the end
        recoveryPromises.push(resumeImportJob(db, doc.id, sweeperId));
      }
    } else {
      skipped++;
    }
  }

  // Await all recoveries
  const results = await Promise.allSettled(recoveryPromises);
  const recoveriesStarted = recoveryPromises.length;
  const recoveriesSucceeded = results.filter(r => r.status === 'fulfilled').length;
  const recoveriesFailed = results.filter(r => r.status === 'rejected').length;

  console.log(`Zombie Sweeper Completed. Scanned: ${scanned}, Zombies: ${zombiesDetected}, Skipped: ${skipped}, Leases: ${leasesAcquired}, Recoveries Started: ${recoveriesStarted}, Succeeded: ${recoveriesSucceeded}, Failed: ${recoveriesFailed}`);
});
