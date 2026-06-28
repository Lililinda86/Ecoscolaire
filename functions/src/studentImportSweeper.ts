import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

export const sweepZombieImportJobs = onSchedule('every 15 minutes', async (event) => {
  const db = admin.firestore();
  console.log('Starting Zombie Sweeper Execution...');

  const limitCount = 50;
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  // We query jobs that are RUNNING or VALIDATING. 
  // We use multiple queries or fetch and filter in memory depending on index availability.
  // Given low expected volume of active jobs at any exact moment, filtering in memory after a simple 'in' query is robust.
  const jobsSnap = await db.collection('student_import_jobs')
    .where('status', 'in', ['RUNNING', 'VALIDATING'])
    .limit(limitCount)
    .get();

  let scanned = 0;
  let zombiesDetected = 0;
  let skipped = 0;

  jobsSnap.forEach((doc) => {
    scanned++;
    const data = doc.data();
    
    // Fallback to startedAt if updatedAt is missing for some reason
    const lastActive = data.updatedAt ? data.updatedAt.toDate() : (data.startedAt ? data.startedAt.toDate() : null);

    if (!lastActive) {
      console.warn(`Job ${doc.id} (School: ${data.schoolId}) lacks updatedAt/startedAt.`);
      skipped++;
      return;
    }

    if (lastActive < fifteenMinutesAgo) {
      zombiesDetected++;
      const ageMinutes = Math.round((Date.now() - lastActive.getTime()) / 60000);
      console.log(`[ZOMBIE DETECTED] JobId: ${doc.id}, SchoolId: ${data.schoolId}, Status: ${data.status}, UpdatedAt: ${lastActive.toISOString()}, Age: ${ageMinutes}m`);
    } else {
      skipped++;
    }
  });

  const summary = { scanned, zombiesDetected, skipped };
  console.log('Zombie Sweeper Completed:', summary);
});
