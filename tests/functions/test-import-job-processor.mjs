import assert from 'assert';
import * as admin from 'firebase-admin';

// Initialize a dummy app for the mocks to attach to
try {
  admin.initializeApp({ projectId: 'demo-mock' });
} catch (e) {}

// Simple mocks
const dbMock = {
  runTransaction: async (cb) => {
    return await cb({
      get: async (ref) => ref.mockGet(),
      update: (ref, data) => ref.mockUpdate(data)
    });
  },
  collection: (path) => ({
    doc: (id) => {
      let state = { exists: true, data: () => ({ status: 'PENDING', schoolId: 'school1', storagePath: 'import_jobs_data/school1/job1.json', totalRows: 2 }) };
      
      const docMock = {
        mockGet: () => state,
        mockUpdate: (data) => {
          Object.assign(state.data(), data);
          docMock.updates.push(data);
        },
        update: async (data) => {
          docMock.mockUpdate(data);
        },
        setState: (newState) => { state = newState; },
        updates: []
      };
      return docMock;
    }
  })
};

const storageMock = {
  bucket: () => ({
    file: (path) => {
      let state = { exists: true, content: '[{"name": "Alice"}, {"name": "Bob"}]' };
      return {
        exists: async () => [state.exists],
        download: async () => [Buffer.from(state.content)],
        setState: (newState) => { state = Object.assign(state, newState); }
      };
    }
  })
};

// Override admin module (dangerous but works in simple scripts)
admin.firestore = () => dbMock;
admin.storage = () => storageMock;
admin.firestore.FieldValue = { serverTimestamp: () => 'MOCK_TIMESTAMP' };

import { processStudentImportJob } from '../../functions/lib/importStudents.js';

async function runTests() {
  console.log('=== DÉMARRAGE DES TESTS MOCKÉS (UNIT TESTS) ===');
  let passed = 0;
  let failed = 0;

  async function testCase(name, setupDoc, setupFile, expectedStatus, expectedErrorCode = null) {
    console.log(`\nTEST: ${name}`);
    const docRef = dbMock.collection('student_import_jobs').doc('job1');
    docRef.updates = [];
    docRef.setState(setupDoc());
    
    // Extract the handler
    const handler = processStudentImportJob.__endpoint?.parsedTrigger?.run || processStudentImportJob.run;

    // We can just invoke the handler directly since firebase-functions v2 exports .run
    // But since the v2 API structure might differ in the compiled output, let's look at the function object
    // If it's v2, it has a .run(event) method.
    try {
      const event = {
        data: {
          data: docRef.mockGet().data
        },
        params: { jobId: 'job1' }
      };

      // Mock storage state
      const fileMock = storageMock.bucket().file('anything');
      fileMock.setState(setupFile());

      await processStudentImportJob.run(event);

      const finalUpdates = docRef.updates;
      const lastUpdate = finalUpdates[finalUpdates.length - 1];

      if (!lastUpdate && expectedStatus === 'NO_OP') {
        console.log(`✅ ${name} -> PASS (No operations performed as expected)`);
        passed++;
        return;
      }

      if (lastUpdate?.status === expectedStatus) {
        if (expectedErrorCode && lastUpdate.errorCode !== expectedErrorCode) {
           console.log(`❌ ${name} -> FAIL: Expected ErrorCode ${expectedErrorCode}, got ${lastUpdate.errorCode}`);
           failed++;
           return;
        }
        console.log(`✅ ${name} -> PASS (Status: ${expectedStatus})`);
        passed++;
      } else {
        console.log(`❌ ${name} -> FAIL: Expected ${expectedStatus}, got ${lastUpdate?.status}`);
        failed++;
      }

    } catch (error) {
      console.log(`❌ ${name} -> ERROR: ${error.message}`);
      failed++;
    }
  }

  await testCase(
    '1. Job PENDING valide -> VALIDATING_COMPLETE',
    () => ({ exists: true, data: () => ({ status: 'PENDING', schoolId: 'school1', storagePath: 'import_jobs_data/school1/job1.json', totalRows: 2 }) }),
    () => ({ exists: true, content: '[{"name":"Alice"},{"name":"Bob"}]' }),
    'VALIDATING_COMPLETE'
  );

  await testCase(
    '2. Double trigger simulé (job pas PENDING)',
    () => ({ exists: true, data: () => ({ status: 'VALIDATING', schoolId: 'school1', storagePath: 'import_jobs_data/school1/job1.json', totalRows: 2 }) }),
    () => ({ exists: true, content: '[]' }),
    'NO_OP'
  );

  await testCase(
    '3. storagePath falsifié',
    () => ({ exists: true, data: () => ({ status: 'PENDING', schoolId: 'school1', storagePath: 'import_jobs_data/school2/job1.json', totalRows: 2 }) }),
    () => ({ exists: true, content: '[]' }),
    'FAILED',
    'PROCESSOR_PHASE_1_ERROR'
  );

  await testCase(
    '4. JSON malformé',
    () => ({ exists: true, data: () => ({ status: 'PENDING', schoolId: 'school1', storagePath: 'import_jobs_data/school1/job1.json', totalRows: 2 }) }),
    () => ({ exists: true, content: 'INVALID_JSON' }),
    'FAILED',
    'PROCESSOR_PHASE_1_ERROR'
  );

  await testCase(
    '5. Payload non-array',
    () => ({ exists: true, data: () => ({ status: 'PENDING', schoolId: 'school1', storagePath: 'import_jobs_data/school1/job1.json', totalRows: 2 }) }),
    () => ({ exists: true, content: '{"name": "Alice"}' }),
    'FAILED',
    'PROCESSOR_PHASE_1_ERROR'
  );

  await testCase(
    '6. TotalRows mismatch',
    () => ({ exists: true, data: () => ({ status: 'PENDING', schoolId: 'school1', storagePath: 'import_jobs_data/school1/job1.json', totalRows: 10 }) }),
    () => ({ exists: true, content: '[{"name":"Alice"}]' }),
    'FAILED',
    'PROCESSOR_PHASE_1_ERROR'
  );

  await testCase(
    '7. Payload vide (0 lignes)',
    () => ({ exists: true, data: () => ({ status: 'PENDING', schoolId: 'school1', storagePath: 'import_jobs_data/school1/job1.json', totalRows: 0 }) }),
    () => ({ exists: true, content: '[]' }),
    'FAILED',
    'PROCESSOR_PHASE_1_ERROR'
  );

  console.log(`\n=== RÉSULTATS: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

runTests();
