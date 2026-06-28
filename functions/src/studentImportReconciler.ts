import * as admin from 'firebase-admin';

/**
 * Reconciles the studentCount for a school based on the ground truth in Firestore.
 * This function guarantees absolute accounting integrity by bypassing all RAM counters
 * and using Firestore native AggregateQuery.
 */
export async function reconcileImportJobQuota(
  db: FirebaseFirestore.Firestore,
  jobId: string,
  schoolId: string
): Promise<void> {
  const jobRef = db.collection('student_import_jobs').doc(jobId);
  const schoolRef = db.collection('schools').doc(schoolId);
  const studentsQuery = db.collection('students').where('schoolId', '==', schoolId);

  await db.runTransaction(async (t) => {
    // 1. Read job and school
    const jobSnap = await t.get(jobRef);
    if (!jobSnap.exists) return;

    const jobData = jobSnap.data() || {};
    
    // Check if reconciliation is authorized and needed
    if (jobData.quotaReserved !== true) {
      console.log(`Job ${jobId}: Quota was never reserved. No reconciliation needed.`);
      return;
    }
    if (jobData.quotaReconciled === true) {
      console.log(`Job ${jobId}: Quota already reconciled. No-op.`);
      return;
    }
    
    // Only terminal states are reconciled. RUNNING zombies must be swept first.
    const terminalStates = ['SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED'];
    if (!terminalStates.includes(jobData.status)) {
      console.log(`Job ${jobId}: Status ${jobData.status} is not terminal. Skipping reconciliation.`);
      return;
    }

    const schoolSnap = await t.get(schoolRef);
    if (!schoolSnap.exists) {
      console.error(`School ${schoolId} not found. Cannot reconcile quota.`);
      // We still mark the job as reconciled so it doesn't loop forever
      t.update(jobRef, {
        quotaReconciled: true,
        quotaReconciledAt: admin.firestore.FieldValue.serverTimestamp(),
        reconciliationNote: 'School not found'
      });
      return;
    }

    // 2. Read GROUND TRUTH student count
    const countQuery = studentsQuery.count();
    const countSnap = await t.get(countQuery);
    const realCount = countSnap.data().count;

    // 3. Write updates atomically
    t.update(schoolRef, { studentCount: realCount });
    t.update(jobRef, {
      quotaReconciled: true,
      quotaReconciledAt: admin.firestore.FieldValue.serverTimestamp(),
      quotaReconciliationRealCount: realCount
    });
  });
}
