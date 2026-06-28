import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

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

      // 3. Basic Validation (Phase 1)
      let validRows = 0;
      let invalidRows = 0;

      for (const row of payload) {
        // Minimal basic validation
        if (row && typeof row === 'object' && row.name && typeof row.name === 'string' && row.name.trim() !== '') {
          validRows++;
        } else {
          invalidRows++;
        }
      }

      if (invalidRows > 0) {
        throw new Error(`Basic validation failed: ${invalidRows} invalid rows found`);
      }

      // 4. Set final status for Phase 1
      await jobRef.update({
        status: 'VALIDATING_COMPLETE',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

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
