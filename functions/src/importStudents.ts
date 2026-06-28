import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { normalizeRows } from './studentImportNormalizer';
import { runDiscovery } from './studentImportDiscovery';
import { reserveStudentImportQuota } from './studentImportQuota';

// Trigger on document creation in student_import_jobs
export const processStudentImportJob = onDocumentCreated(
  {
    document: 'student_import_jobs/{jobId}',
    maxInstances: 10,
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    const jobData = snapshot.data();
    const jobId = event.params.jobId;
    const db = admin.firestore();
    const jobRef = db.collection('student_import_jobs').doc(jobId);

    // 1. Transactional Lock (Idempotency)
    const lockAcquired = await db.runTransaction(async (transaction) => {
      const currentJobSnap = await transaction.get(jobRef);
      if (!currentJobSnap.exists) {
        return false;
      }
      
      const currentJobData = currentJobSnap.data();
      if (currentJobData?.status !== 'PENDING') {
        console.log(`Job ${jobId} is not PENDING. Current status: ${currentJobData?.status}. Aborting.`);
        return false;
      }

      // Lock the job by moving it to VALIDATING
      transaction.update(jobRef, {
        status: 'VALIDATING',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return true;
    });

    if (!lockAcquired) {
      return; // Stop here, double trigger or already processed
    }

    try {
      const schoolId = jobData.schoolId;
      const expectedStoragePath = `import_jobs_data/${schoolId}/${jobId}.json`;
      const actualStoragePath = jobData.storagePath;

      if (actualStoragePath !== expectedStoragePath) {
        throw new Error(`Invalid storagePath. Expected: ${expectedStoragePath}, Got: ${actualStoragePath}`);
      }

      // 2. Download JSON from Storage
      const bucket = admin.storage().bucket();
      const file = bucket.file(actualStoragePath);
      
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`Storage file not found at ${actualStoragePath}`);
      }

      // Read file content
      const [fileBuffer] = await file.download();
      
      // Limit file size (e.g. 10MB)
      if (fileBuffer.length > 10 * 1024 * 1024) {
        throw new Error('File exceeds 10MB limit');
      }

      let payload: any[];
      try {
        const fileContent = fileBuffer.toString('utf-8');
        payload = JSON.parse(fileContent);
      } catch (err) {
        throw new Error('Invalid JSON format');
      }

      if (!Array.isArray(payload)) {
        throw new Error('JSON payload must be an array');
      }

      if (payload.length === 0) {
        throw new Error('JSON payload is empty');
      }

      if (payload.length !== jobData.totalRows) {
        throw new Error(`Row count mismatch. Expected: ${jobData.totalRows}, Got: ${payload.length}`);
      }

      // 3. Normalization (Phase 2A)
      const normalizedData = normalizeRows(payload, schoolId, jobId);

      if (normalizedData.summary.invalid > 0 && normalizedData.summary.valid === 0) {
        throw new Error(`Basic validation failed: ${normalizedData.summary.invalid} invalid rows found`);
      }

      // 4. Discovery (Phase 2B)
      const schoolRef = db.collection('schools').doc(schoolId);
      const schoolSnap = await schoolRef.get();
      const schoolData = schoolSnap.data() || {};
      const currentStudentCount = schoolData.studentCount || 0;
      const studentLimit = schoolData.studentLimit || Infinity;

      const discoveryResult = await runDiscovery(db, normalizedData, currentStudentCount, studentLimit);

      if (!discoveryResult.quotaCheck.passed) {
        throw new Error(`QUOTA_EXCEEDED`); // Will be caught by global handler
      }

      // 5. Transition to VALIDATING_COMPLETE (End of Phase 2B)
      await jobRef.update({
        status: 'VALIDATING_COMPLETE',
        discoverySummary: discoveryResult.summary,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 6. Phase 2C: Quota Reservation
      const quotaRes = await reserveStudentImportQuota(db, jobId, schoolId, discoveryResult.summary.newStudents, discoveryResult.summary);
      
      if (!quotaRes.success) {
        console.log(`Quota reservation failed: ${quotaRes.errorCode}`);
        return; // Job is already marked as FAILED inside reserveStudentImportQuota
      }

      // Job is now RUNNING and quota is reserved.
      // Phase 2D (BulkWriter) will follow here.

    } catch (error: any) {
      console.error(`Error processing job ${jobId}:`, error);
      await jobRef.update({
        status: 'FAILED',
        errorCode: 'PROCESSOR_PHASE_1_ERROR',
        errorMessage: error.message || 'Unknown error',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        finishedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
);
