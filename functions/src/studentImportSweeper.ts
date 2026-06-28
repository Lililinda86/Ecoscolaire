import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

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
    const fifteenMinutesAgoMillis = now.toMillis() - 15 * 60 * 1000;

    // Check status
    if (data.status !== 'RUNNING' && data.status !== 'VALIDATING') {
      console.log(`LEASE_JOB_NOT_ELIGIBLE (Status): JobId: ${jobRef.id}, SchoolId: ${data.schoolId}, SweeperId: ${sweeperId}`);
      return false;
    }

    // Check age (zombie > 15 min)
    const lastActive = data.updatedAt ? data.updatedAt.toMillis() : (data.startedAt ? data.startedAt.toMillis() : 0);
    if (!lastActive || lastActive >= fifteenMinutesAgoMillis) {
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
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  const jobsSnap = await db.collection('student_import_jobs')
    .where('status', 'in', ['RUNNING', 'VALIDATING'])
    .limit(limitCount)
    .get();

  let scanned = 0;
  let zombiesDetected = 0;
  let skipped = 0;
  let leasesAcquired = 0;

  for (const doc of jobsSnap.docs) {
    scanned++;
    const data = doc.data();
    
    const lastActive = data.updatedAt ? data.updatedAt.toDate() : (data.startedAt ? data.startedAt.toDate() : null);

    if (!lastActive) {
      skipped++;
      continue;
    }

    if (lastActive < fifteenMinutesAgo) {
      zombiesDetected++;
      // Attempt to acquire lease (E1.2)
      const acquired = await acquireZombieLease(db, doc.ref, sweeperId);
      if (acquired) {
        leasesAcquired++;
      }
    } else {
      skipped++;
    }
  }

  const summary = { scanned, zombiesDetected, skipped, leasesAcquired };
  console.log('Zombie Sweeper Completed:', summary);
});
