const assert = require('assert');
const { reconcileImportJobQuota } = require('../../functions/lib/studentImportReconciler.js');

const admin = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => 'SERVER_TIMESTAMP'
    }
  }
};

let passed = 0;
let failed = 0;

async function testCase(name, setup, execute, verify) {
  console.log(`\nTEST: ${name}`);
  try {
    const { finalJobData, finalSchoolData } = await execute(setup());
    verify(finalJobData, finalSchoolData);
    console.log(`✅ ${name} -> PASS`);
    passed++;
  } catch (error) {
    console.error(`❌ ${name} -> FAIL`);
    console.error(error);
    failed++;
  }
}

function createDbMock(jobState, schoolState, actualStudentCount) {
  const db = {
    _jobData: { ...jobState },
    _schoolData: schoolState ? { ...schoolState } : null,
    
    collection: (path) => ({
      doc: (id) => ({ id, path: `${path}/${id}` }),
      where: () => ({
        count: () => ({
          // We need this to match the mock used inside the transaction
          __isCountQuery: true
        })
      })
    }),

    runTransaction: async (cb) => {
      const transaction = {
        get: async (ref) => {
          if (ref.__isCountQuery) {
            return { data: () => ({ count: actualStudentCount }) };
          }
          if (ref.path && ref.path.includes('student_import_jobs')) {
            return { exists: true, data: () => db._jobData };
          }
          if (ref.path && ref.path.includes('schools')) {
            if (!db._schoolData) return { exists: false };
            return { exists: true, data: () => db._schoolData };
          }
          return { exists: false, data: () => null };
        },
        update: (ref, data) => {
          if (ref.path && ref.path.includes('student_import_jobs')) {
            Object.assign(db._jobData, data);
          }
          if (ref.path && ref.path.includes('schools')) {
            Object.assign(db._schoolData, data);
          }
        }
      };
      await cb(transaction);
    }
  };
  return db;
}

async function runTests() {
  console.log('=== DÉMARRAGE DES TESTS PHASE 2E (RECONCILIATION) ===');

  await testCase('T1: Compteur trop haut -> Corrigé (Surfacturation résolue)',
    () => {
      // 100 students in db, but school counter thinks 150
      return createDbMock(
        { status: 'SUCCESS', quotaReserved: true, quotaReconciled: false },
        { studentCount: 150 },
        100
      );
    },
    async (db) => {
      await reconcileImportJobQuota(db, 'job1', 'school1');
      return { finalJobData: db._jobData, finalSchoolData: db._schoolData };
    },
    (job, school) => {
      assert.strictEqual(school.studentCount, 100);
      assert.strictEqual(job.quotaReconciled, true);
    }
  );

  await testCase('T2: Compteur trop bas -> Corrigé (Élèves gratuits résolus)',
    () => {
      // 200 students in db, but school counter thinks 100 (e.g. FAILED refunded but students existed)
      return createDbMock(
        { status: 'FAILED', quotaReserved: true, quotaReconciled: false },
        { studentCount: 100 },
        200
      );
    },
    async (db) => {
      await reconcileImportJobQuota(db, 'job1', 'school1');
      return { finalJobData: db._jobData, finalSchoolData: db._schoolData };
    },
    (job, school) => {
      assert.strictEqual(school.studentCount, 200);
      assert.strictEqual(job.quotaReconciled, true);
    }
  );

  await testCase('T3: Quota non réservé -> Ignoré',
    () => {
      return createDbMock(
        { status: 'FAILED', quotaReserved: false, quotaReconciled: false },
        { studentCount: 100 },
        100
      );
    },
    async (db) => {
      await reconcileImportJobQuota(db, 'job1', 'school1');
      return { finalJobData: db._jobData, finalSchoolData: db._schoolData };
    },
    (job, school) => {
      assert.strictEqual(school.studentCount, 100);
      assert.strictEqual(job.quotaReconciled, false);
    }
  );

  await testCase('T4: Quota déjà réconcilié -> Ignoré',
    () => {
      return createDbMock(
        { status: 'SUCCESS', quotaReserved: true, quotaReconciled: true },
        { studentCount: 150 }, // Should stay 150 because it's ignored
        100
      );
    },
    async (db) => {
      await reconcileImportJobQuota(db, 'job1', 'school1');
      return { finalJobData: db._jobData, finalSchoolData: db._schoolData };
    },
    (job, school) => {
      assert.strictEqual(school.studentCount, 150); 
    }
  );

  await testCase('T5: Job RUNNING zombie -> Ignoré',
    () => {
      return createDbMock(
        { status: 'RUNNING', quotaReserved: true, quotaReconciled: false },
        { studentCount: 150 }, 
        100
      );
    },
    async (db) => {
      await reconcileImportJobQuota(db, 'job1', 'school1');
      return { finalJobData: db._jobData, finalSchoolData: db._schoolData };
    },
    (job, school) => {
      assert.strictEqual(school.studentCount, 150); 
      assert.strictEqual(job.quotaReconciled, false); 
    }
  );

  await testCase('T6: École supprimée -> Job marqué reconciled mais school pas touchée',
    () => {
      return createDbMock(
        { status: 'SUCCESS', quotaReserved: true, quotaReconciled: false },
        null, // No school
        100
      );
    },
    async (db) => {
      await reconcileImportJobQuota(db, 'job1', 'school1');
      return { finalJobData: db._jobData, finalSchoolData: db._schoolData };
    },
    (job, school) => {
      assert.strictEqual(school, null); 
      assert.strictEqual(job.quotaReconciled, true); 
      assert.strictEqual(job.reconciliationNote, 'School not found');
    }
  );

  console.log(`\n=== RÉSULTATS: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

runTests();
