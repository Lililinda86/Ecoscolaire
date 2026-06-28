import * as admin from 'firebase-admin';

export interface QuotaReservationResult {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  reservedCount: number;
  isNoOp?: boolean;
}

/**
 * Executes Phase 2C: Transactional Quota Reservation.
 * Idempotent operation: locks the job to RUNNING and increments school studentCount.
 */
export async function reserveStudentImportQuota(
  db: FirebaseFirestore.Firestore,
  jobId: string,
  schoolId: string,
  newStudentsCount: number,
  discoverySummary: any
): Promise<QuotaReservationResult> {
  const jobRef = db.collection('student_import_jobs').doc(jobId);
  const schoolRef = db.collection('schools').doc(schoolId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 1. Read job for idempotence
      const jobSnap = await transaction.get(jobRef);
      if (!jobSnap.exists) {
        throw new Error('JOB_NOT_FOUND');
      }
      const jobData = jobSnap.data() || {};
      
      // Idempotence check: if not VALIDATING_COMPLETE, we stop.
      // If it's already RUNNING, SUCCESS, FAILED, it's a no-op / duplicate trigger.
      if (jobData.status === 'RUNNING' || jobData.status === 'SUCCESS' || jobData.status === 'FAILED') {
        return { success: true, reservedCount: jobData.reservedCount || 0, isNoOp: true };
      }
      
      if (jobData.status !== 'VALIDATING_COMPLETE') {
        throw new Error('INVALID_JOB_STATUS');
      }

      if (jobData.reservedCount !== undefined) {
        // Already reserved? Safety net
        return { success: true, reservedCount: jobData.reservedCount, isNoOp: true };
      }

      // 2. Read school
      const schoolSnap = await transaction.get(schoolRef);
      if (!schoolSnap.exists) {
        throw new Error('SCHOOL_NOT_FOUND');
      }
      
      const schoolData = schoolSnap.data() || {};

      if (schoolData.subscriptionStatus && schoolData.subscriptionStatus !== 'active' && schoolData.subscriptionStatus !== 'trialing') {
        throw new Error('SUBSCRIPTION_SUSPENDED');
      }

      if (schoolData.studentLimit === undefined || schoolData.studentLimit === null) {
        throw new Error('LIMIT_UNDEFINED');
      }

      const currentCount = schoolData.studentCount || 0;
      const limit = schoolData.studentLimit;
      
      // 3. Quota check
      if (newStudentsCount > 0) {
        if (currentCount + newStudentsCount > limit) {
          throw new Error('QUOTA_EXCEEDED');
        }
        
        // Update school
        transaction.update(schoolRef, {
          studentCount: currentCount + newStudentsCount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // 4. Update Job
      transaction.update(jobRef, {
        status: 'RUNNING',
        reservedCount: newStudentsCount,
        quotaReservedAt: admin.firestore.FieldValue.serverTimestamp(),
        discoverySummary,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { success: true, reservedCount: newStudentsCount, isNoOp: false };
    });

    return {
      success: true,
      reservedCount: result.reservedCount,
      isNoOp: result.isNoOp
    };
  } catch (error: any) {
    const errorCode = error.message; // From our throw statements
    
    // Map known errors to specific codes, else generic
    const knownCodes = ['JOB_NOT_FOUND', 'INVALID_JOB_STATUS', 'SCHOOL_NOT_FOUND', 'SUBSCRIPTION_SUSPENDED', 'LIMIT_UNDEFINED', 'QUOTA_EXCEEDED'];
    
    if (knownCodes.includes(errorCode)) {
      // It's a business logic failure we explicitly threw
      // We must mark the job as failed, except for JOB_NOT_FOUND (can't update it)
      if (errorCode !== 'JOB_NOT_FOUND' && errorCode !== 'INVALID_JOB_STATUS') {
        await markImportJobFailedIfCurrent(db, jobId, errorCode, error.message);
      }
      return { success: false, errorCode, reservedCount: 0 };
    }

    // Unhandled / Transaction aborted / Permission denied
    return { success: false, errorCode: 'TRANSACTION_ERROR', errorMessage: error.message, reservedCount: 0 };
  }
}

/**
 * Safely marks a job as FAILED without risking overwriting a more advanced state.
 * Prevents FAILED UPDATE RACE conditions.
 */
export async function markImportJobFailedIfCurrent(
  db: FirebaseFirestore.Firestore,
  jobId: string,
  errorCode: string,
  errorMessage: string
): Promise<void> {
  const jobRef = db.collection('student_import_jobs').doc(jobId);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(jobRef);
    if (!snap.exists) return;

    const data = snap.data() || {};
    const status = data.status;

    // Terminal or running states must NEVER be overwritten by an old failure
    if (['RUNNING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED'].includes(status)) {
      return; // no-op
    }

    // Eligible states (PENDING, VALIDATING, VALIDATING_COMPLETE)
    transaction.update(jobRef, {
      status: 'FAILED',
      errorCode,
      errorMessage,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
}
