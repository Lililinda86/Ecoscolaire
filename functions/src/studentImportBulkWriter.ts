import * as admin from 'firebase-admin';
import { NormalizedStudentRow } from './studentImportNormalizer';

export interface BulkWriterImportResult {
  successfulCreates: number;
  successfulUpdates: number;
  failedCreates: number; // Important for Phase 2E quota refund
  failedUpdates: number;
  retriedWrites: number;
  permanentFailures: Array<{ matricule: string, documentId: string, code: string, message: string }>;
  durationMs: number;
}

/**
 * Executes a BulkWriter operation to safely insert or update students.
 * Idempotency is guaranteed by deterministic IDs and strict create/update segregation
 * provided by Phase 2B.
 */
export async function executeBulkWriterImport(
  db: FirebaseFirestore.Firestore,
  jobId: string,
  schoolId: string,
  creates: NormalizedStudentRow[],
  updates: NormalizedStudentRow[]
): Promise<BulkWriterImportResult> {
  const startTime = Date.now();
  
  const result: BulkWriterImportResult = {
    successfulCreates: 0,
    successfulUpdates: 0,
    failedCreates: 0,
    failedUpdates: 0,
    retriedWrites: 0,
    permanentFailures: [],
    durationMs: 0
  };

  const bulkWriter = db.bulkWriter();
  
  // Track promises to ensure we catch everything
  const allPromises: Promise<any>[] = [];

  // Map to track operation types for error handling
  const operationTypeMap = new Map<string, { type: 'create' | 'update', matricule: string }>();

  // Configure retries for transient errors
  bulkWriter.onWriteError((error) => {
    const transientCodes = [10, 14, 13]; // ABORTED, UNAVAILABLE, INTERNAL (sometimes transient)
    // In Firebase Admin SDK, error.code is often grpc status code (number)
    const isTransient = transientCodes.includes(error.code);
    
    if (isTransient && error.failedAttempts < 3) {
      result.retriedWrites++;
      return true; // Retry
    }
    
    // Permanent error or max retries exceeded
    return false; // Do not retry
  });

  bulkWriter.onWriteResult((docRef, resultSnap) => {
    // Success callback
    const op = operationTypeMap.get(docRef.id);
    if (op) {
      if (op.type === 'create') result.successfulCreates++;
      if (op.type === 'update') result.successfulUpdates++;
    }
  });

  // Enqueue creates
  for (const row of creates) {
    const docRef = db.collection('students').doc(row.id);
    operationTypeMap.set(row.id, { type: 'create', matricule: row.matricule });
    
    const promise = bulkWriter.create(docRef, {
      ...row,
      schoolId,
      importJobId: jobId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch(err => {
      // Individual promise rejection means it failed permanently (or max retries)
      result.failedCreates++;
      result.permanentFailures.push({
        matricule: row.matricule,
        documentId: row.id,
        code: String(err.code),
        message: err.message
      });
    });
    allPromises.push(promise);
  }

  // Enqueue updates
  for (const row of updates) {
    const docRef = db.collection('students').doc(row.id);
    operationTypeMap.set(row.id, { type: 'update', matricule: row.matricule });
    
    // We don't overwrite createdAt for updates
    const promise = bulkWriter.update(docRef, {
      ...row,
      schoolId,
      lastImportJobId: jobId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch(err => {
      result.failedUpdates++;
      result.permanentFailures.push({
        matricule: row.matricule,
        documentId: row.id,
        code: String(err.code),
        message: err.message
      });
    });
    allPromises.push(promise);
  }

  // Await the close to flush all batches
  await bulkWriter.close();
  
  // Also await all individual promises (they are catching internally so they won't reject here, but safe to wait)
  await Promise.allSettled(allPromises);

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Marks the job as SUCCESS or PARTIAL_SUCCESS securely via a transaction,
 * ensuring it doesn't overwrite a FAILED or already finished state.
 */
export async function markImportJobCompletedIfRunning(
  db: FirebaseFirestore.Firestore,
  jobId: string,
  bulkWriterResult: BulkWriterImportResult
): Promise<void> {
  const jobRef = db.collection('student_import_jobs').doc(jobId);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(jobRef);
    if (!snap.exists) return;

    const data = snap.data() || {};
    if (data.status !== 'RUNNING') {
      console.log(`Job ${jobId} not in RUNNING state (${data.status}). Cannot mark completed.`);
      return;
    }

    const hasFailures = bulkWriterResult.failedCreates > 0 || bulkWriterResult.failedUpdates > 0;
    const finalStatus = hasFailures ? 'PARTIAL_SUCCESS' : 'SUCCESS';

    transaction.update(jobRef, {
      status: finalStatus,
      bulkWriterSummary: bulkWriterResult,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
}
