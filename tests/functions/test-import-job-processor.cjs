const Module = require('module');
const originalRequire = Module.prototype.require;

const docs = {};

const dbMock = {
  runTransaction: async (cb) => {
    return await cb({
      get: async (ref) => ref.mockGet(),
      update: (ref, data) => ref.mockUpdate(data)
    });
  },
  getAll: async (...docRefs) => {
    return docRefs.map(ref => ({ exists: false }));
  },
  collection: (path) => ({
    doc: (id) => {
      if (path === 'schools') {
        return { get: async () => ({ data: () => ({ studentCount: 0, studentLimit: 100 }) }) };
      }
      const key = `${path}/${id}`;
      if (!docs[key]) {
        let state = { exists: true, data: () => ({ status: 'PENDING', schoolId: 'school1', storagePath: 'import_jobs_data/school1/job1.json', totalRows: 2 }) };
        
        docs[key] = {
          mockGet: () => state,
          mockUpdate: (data) => {
            Object.assign(state.data(), data);
            docs[key].updates.push(data);
          },
          update: async (data) => {
            docs[key].mockUpdate(data);
          },
          setState: (newState) => { state = newState; },
          updates: []
        };
      }
      return docs[key];
    }
  })
};

const files = {};
const storageMock = {
  bucket: () => ({
    file: (path) => {
      if (!files[path]) {
        let state = { exists: true, content: JSON.stringify([{ matricule: 'M001', name: 'John Doe', classId: 'C1' }, { matricule: 'M002', name: 'Jane Doe', classId: 'C1' }]) };
        files[path] = {
          exists: async () => [state.exists],
          download: async () => [Buffer.from(state.content)],
          setState: (newState) => { state = Object.assign(state, newState); }
        };
      }
      return files[path];
    }
  })
};

const adminMock = {
  initializeApp: () => {},
  firestore: () => dbMock,
  storage: () => storageMock
};
adminMock.firestore.FieldValue = { serverTimestamp: () => 'MOCK_TIMESTAMP' };

Module.prototype.require = function() {
  if (arguments[0] === 'firebase-admin') {
    return adminMock;
  }
  return originalRequire.apply(this, arguments);
};

const { processStudentImportJob } = require('../../functions/lib/importStudents.js');

async function runTests() {
  console.log('=== DÉMARRAGE DES TESTS MOCKÉS (UNIT TESTS) ===');
  let passed = 0;
  let failed = 0;

  async function testCase(name, setupDoc, setupFile, expectedStatus, expectedErrorCode = null) {
    console.log(`\nTEST: ${name}`);
    const docRef = dbMock.collection('student_import_jobs').doc('job1');
    docRef.updates = [];
    docRef.setState(setupDoc());
    
    const handler = processStudentImportJob.__endpoint?.parsedTrigger?.run || processStudentImportJob.run;

    try {
      const event = {
        data: {
          data: docRef.mockGet().data
        },
        params: { jobId: 'job1' }
      };

      const fileMock = storageMock.bucket().file(docRef.mockGet().data().storagePath || 'import_jobs_data/school1/job1.json');
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
    () => ({ exists: true, content: '[{"matricule":"M1","name":"Alice","classId":"C1"},{"matricule":"M2","name":"Bob","classId":"C1"}]' }),
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
