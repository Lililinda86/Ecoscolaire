import * as admin from 'firebase-admin';
import { normalizeRows } from './studentImportNormalizer';
import { runDiscovery } from './studentImportDiscovery';
import { reserveStudentImportQuota } from './studentImportQuota';
import { executeBulkWriterImport } from './studentImportBulkWriter';
import { reconcileImportJobQuota } from './studentImportReconciler';

/**
 * Renews the lease for the current sweeper if it still owns it.
 */
export async function renewLeaseIfOwner(
  db: admin.firestore.Firestore,
  jobRef: admin.firestore.DocumentReference,
  sweeperId: string
): Promise<boolean> {
  return db.runTransaction(async (t) => {
    const doc = await t.get(jobRef);
    if (!doc.exists) return false;

    const data = doc.data()!;
    if (data.status !== 'RUNNING' && data.status !== 'VALIDATING') return false;
    
    if (data.sweeperLockedBy !== sweeperId) return false;
    
    // Check if still valid or renewable by owner
    const now = admin.firestore.Timestamp.now();
    t.update(jobRef, {
      sweeperLockedUntil: admin.firestore.Timestamp.fromMillis(now.toMillis() + 15 * 60000),
      lastHeartbeatAt: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return true;
  });
}

/**
 * Updates the lastHeartbeatAt timestamp for the job to prove it's still alive.
 */
export async function updateHeartbeat(
  db: admin.firestore.Firestore,
  jobRef: admin.firestore.DocumentReference
): Promise<void> {
  await jobRef.update({
    lastHeartbeatAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * Safe transaction to finalize the job only if the lease is still held.
 */
async function finalizeRecoveryIfOwner(
  db: admin.firestore.Firestore,
  jobRef: admin.firestore.DocumentReference,
  sweeperId: string,
  finalStatus: string,
  extraData: any = {}
): Promise<void> {
  await db.runTransaction(async (t) => {
    const doc = await t.get(jobRef);
    if (!doc.exists) throw new Error('Job not found');

    const data = doc.data()!;
    if (data.status !== 'RUNNING' && data.status !== 'VALIDATING') {
      throw new Error('SafeAbort: Status changed');
    }
    if (data.sweeperLockedBy !== sweeperId) {
      throw new Error('SafeAbort: Lease stolen');
    }
    if (data.sweeperLockedUntil && data.sweeperLockedUntil.toMillis() < Date.now()) {
      throw new Error('SafeAbort: Lease expired');
    }

    t.update(jobRef, {
      status: finalStatus,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...extraData
    });
  });
}

/**
 * Resumes an import job from scratch (Storage), safely handling quota.
 */
export async function resumeImportJob(
  db: admin.firestore.Firestore,
  jobId: string,
  sweeperId: string
): Promise<void> {
  const jobRef = db.collection('student_import_jobs').doc(jobId);
  const doc = await jobRef.get();
  if (!doc.exists) return;

  const jobData = doc.data()!;
  const schoolId = jobData.schoolId;
  const storagePath = jobData.storagePath || `import_jobs_data/${schoolId}/${jobId}.json`;
  const quotaReserved = jobData.quotaReserved === true;

  try {
    // 1. Re-download from GCS
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      // Storage Missing -> FAILED
      await finalizeRecoveryIfOwner(db, jobRef, sweeperId, 'FAILED', {
        errorType: 'SYSTEM_ERROR',
        errorMessage: `Storage file missing at ${storagePath}`
      });
      // Need to reconcile if quota was reserved
      if (quotaReserved) {
        await reconcileImportJobQuota(db, jobId, schoolId);
      }
      return;
    }

    const [fileBuffer] = await file.download();
    const payload = JSON.parse(fileBuffer.toString('utf-8'));
    
    // Heartbeat after Phase 1 (Download/Parse)
    await updateHeartbeat(db, jobRef);
    if (!(await renewLeaseIfOwner(db, jobRef, sweeperId))) throw new Error('SafeAbort');

    // 2. Normalization (Phase 2A)
    const normalizedData = normalizeRows(payload, schoolId, jobId);
    
    // Heartbeat after Phase 2A
    await updateHeartbeat(db, jobRef);
    if (!(await renewLeaseIfOwner(db, jobRef, sweeperId))) throw new Error('SafeAbort');

    // 3. Discovery (Phase 2B)
    const schoolRef = db.collection('schools').doc(schoolId);
    const schoolSnap = await schoolRef.get();
    const currentStudentCount = schoolSnap.data()?.studentCount || 0;
    const studentLimit = schoolSnap.data()?.studentLimit || Infinity;

    const discoveryResult = await runDiscovery(db, normalizedData, currentStudentCount, studentLimit);
    if (!discoveryResult.quotaCheck.passed) {
      await finalizeRecoveryIfOwner(db, jobRef, sweeperId, 'FAILED', {
        errorType: 'QUOTA_EXCEEDED',
        errorMessage: 'Quota exceeded'
      });
      if (quotaReserved) await reconcileImportJobQuota(db, jobId, schoolId);
      return;
    }

    // Heartbeat after Phase 2B
    await updateHeartbeat(db, jobRef);
    if (!(await renewLeaseIfOwner(db, jobRef, sweeperId))) throw new Error('SafeAbort');

    // 4. Quota (Phase 2C)
    if (!quotaReserved) {
      const quotaRes = await reserveStudentImportQuota(db, jobId, schoolId, discoveryResult.summary.newStudents, discoveryResult.summary);
      if (!quotaRes.success) {
        // Reserve handles marking as failed, but we must do it transactionally
        await finalizeRecoveryIfOwner(db, jobRef, sweeperId, 'FAILED', {
          errorType: quotaRes.errorCode,
          errorMessage: 'Failed to reserve quota during recovery'
        });
        return;
      }
      // Ensure we record that quota is now reserved
      await jobRef.update({ quotaReserved: true });
    }

    // Heartbeat before Phase 2D
    await updateHeartbeat(db, jobRef);
    if (!(await renewLeaseIfOwner(db, jobRef, sweeperId))) throw new Error('SafeAbort');

    // 5. BulkWriter (Phase 2D)
    const bulkWriterResult = await executeBulkWriterImport(
      db, 
      jobId, 
      schoolId, 
      discoveryResult.creates, 
      discoveryResult.updates,
      async (progress) => {
        await updateHeartbeat(db, jobRef);
        const renewed = await renewLeaseIfOwner(db, jobRef, sweeperId);
        if (!renewed) throw new Error("SafeAbort: Lease lost during BulkWriter");
      }
    );

    // 6. Finalization
    const finalStatus = bulkWriterResult.failedCreates > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    await finalizeRecoveryIfOwner(db, jobRef, sweeperId, finalStatus, {
      successfulCreates: bulkWriterResult.successfulCreates,
      successfulUpdates: bulkWriterResult.successfulUpdates,
      failedCreates: bulkWriterResult.failedCreates,
      failedUpdates: bulkWriterResult.failedUpdates,
      permanentFailures: bulkWriterResult.permanentFailures
    });

    // 7. Reconciliation (Phase 2E)
    await reconcileImportJobQuota(db, jobId, schoolId);

  } catch (error: any) {
    if (error.message && error.message.includes('SafeAbort')) {
      console.log(`Recovery for ${jobId} safely aborted: ${error.message}`);
      return; // Do nothing, let it be RUNNING
    }
    console.error(`Recovery error for ${jobId}:`, error);
    try {
      await finalizeRecoveryIfOwner(db, jobRef, sweeperId, 'FAILED', {
        errorType: 'SYSTEM_ERROR',
        errorMessage: error.message || 'Unknown recovery error'
      });
      if (quotaReserved) {
        await reconcileImportJobQuota(db, jobId, schoolId);
      }
    } catch (finErr) {
      console.error(`Failed to mark recovery as FAILED for ${jobId}:`, finErr);
    }
  }
}
