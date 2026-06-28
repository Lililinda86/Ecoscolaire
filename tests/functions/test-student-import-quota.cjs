const assert = require('assert');
const { reserveStudentImportQuota } = require('../../functions/lib/studentImportQuota.js');

async function runTests() {
  console.log('=== DÉMARRAGE DES TESTS MOCKÉS PHASE 2C ===');
  let passed = 0;
  let failed = 0;

  async function testCase(name, fn) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${name} - ERROR: ${err.message}`);
      failed++;
    }
  }

  function createDbMock(initialJob, initialSchool, onTransaction = null) {
    let jobData = initialJob ? { ...initialJob } : null;
    let schoolData = initialSchool ? { ...initialSchool } : null;

    const jobRef = {
      mockGet: () => ({ exists: !!jobData, data: () => jobData }),
      mockUpdate: (data) => {
        jobData = { ...jobData, ...data };
      },
      update: async (data) => {
        jobData = { ...jobData, ...data };
      }
    };

    const schoolRef = {
      mockGet: () => ({ exists: !!schoolData, data: () => schoolData }),
      mockUpdate: (data) => {
        schoolData = { ...schoolData, ...data };
      }
    };

    const db = {
      collection: (col) => ({
        doc: (id) => {
          if (col === 'student_import_jobs') return jobRef;
          if (col === 'schools') return schoolRef;
          return {};
        }
      }),
      runTransaction: async (cb) => {
        if (onTransaction) await onTransaction();
        return await cb({
          get: async (ref) => ref.mockGet(),
          update: (ref, data) => ref.mockUpdate(data)
        });
      },
      getJobData: () => jobData,
      getSchoolData: () => schoolData
    };
    return db;
  }

  // 1. quota suffisant -> studentCount incrémenté
  await testCase('1. quota suffisant -> studentCount incrémenté', async () => {
    const db = createDbMock(
      { status: 'VALIDATING_COMPLETE' },
      { studentCount: 10, studentLimit: 100, subscriptionStatus: 'active' }
    );
    const res = await reserveStudentImportQuota(db, 'job1', 'school1', 5, {});
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.reservedCount, 5);
    assert.strictEqual(res.isNoOp, false);
    assert.strictEqual(db.getSchoolData().studentCount, 15);
    assert.strictEqual(db.getJobData().status, 'RUNNING');
  });

  // 2. quota insuffisant -> FAILED, compteur inchangé
  await testCase('2. quota insuffisant -> FAILED, compteur inchangé', async () => {
    const db = createDbMock(
      { status: 'VALIDATING_COMPLETE' },
      { studentCount: 95, studentLimit: 100, subscriptionStatus: 'active' }
    );
    const res = await reserveStudentImportQuota(db, 'job1', 'school1', 10, {});
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'QUOTA_EXCEEDED');
    assert.strictEqual(db.getSchoolData().studentCount, 95);
    assert.strictEqual(db.getJobData().status, 'FAILED');
    assert.strictEqual(db.getJobData().errorCode, 'QUOTA_EXCEEDED');
  });

  // 3. newStudents = 0 -> reservedCount = 0, compteur inchangé
  await testCase('3. newStudents = 0 -> reservedCount = 0, compteur inchangé', async () => {
    const db = createDbMock(
      { status: 'VALIDATING_COMPLETE' },
      { studentCount: 10, studentLimit: 10, subscriptionStatus: 'active' }
    );
    const res = await reserveStudentImportQuota(db, 'job1', 'school1', 0, {});
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.reservedCount, 0);
    assert.strictEqual(db.getSchoolData().studentCount, 10);
    assert.strictEqual(db.getJobData().status, 'RUNNING');
  });

  // 4. double appel -> pas de double incrément
  await testCase('4. double appel -> pas de double incrément', async () => {
    const db = createDbMock(
      { status: 'VALIDATING_COMPLETE' },
      { studentCount: 10, studentLimit: 100, subscriptionStatus: 'active' }
    );
    await reserveStudentImportQuota(db, 'job1', 'school1', 5, {});
    // Second call simulates retry on already RUNNING job
    const res2 = await reserveStudentImportQuota(db, 'job1', 'school1', 5, {});
    assert.strictEqual(res2.success, true);
    assert.strictEqual(db.getSchoolData().studentCount, 15); // not 20
  });

  // 5. job déjà RUNNING -> no-op
  await testCase('5. job déjà RUNNING -> no-op', async () => {
    const db = createDbMock(
      { status: 'RUNNING', reservedCount: 5 },
      { studentCount: 15, studentLimit: 100, subscriptionStatus: 'active' }
    );
    const res = await reserveStudentImportQuota(db, 'job1', 'school1', 5, {});
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isNoOp, true);
    assert.strictEqual(db.getSchoolData().studentCount, 15);
  });

  // 6. school inexistante -> FAILED
  await testCase('6. school inexistante -> FAILED', async () => {
    const db = createDbMock(
      { status: 'VALIDATING_COMPLETE' },
      null // no school
    );
    const res = await reserveStudentImportQuota(db, 'job1', 'school1', 5, {});
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'SCHOOL_NOT_FOUND');
    assert.strictEqual(db.getJobData().status, 'FAILED');
  });

  // 7. studentCount absent -> comportement défini (treat as 0)
  await testCase('7. studentCount absent -> treat as 0', async () => {
    const db = createDbMock(
      { status: 'VALIDATING_COMPLETE' },
      { studentLimit: 100, subscriptionStatus: 'active' } // no studentCount
    );
    const res = await reserveStudentImportQuota(db, 'job1', 'school1', 5, {});
    assert.strictEqual(res.success, true);
    assert.strictEqual(db.getSchoolData().studentCount, 5);
  });

  // 8. limite absente -> erreur claire
  await testCase('8. limite absente -> erreur claire', async () => {
    const db = createDbMock(
      { status: 'VALIDATING_COMPLETE' },
      { studentCount: 0, subscriptionStatus: 'active' } // no limit
    );
    const res = await reserveStudentImportQuota(db, 'job1', 'school1', 5, {});
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'LIMIT_UNDEFINED');
  });

  // 9. abonnement suspendu -> refus
  await testCase('9. abonnement suspendu -> refus', async () => {
    const db = createDbMock(
      { status: 'VALIDATING_COMPLETE' },
      { studentCount: 0, studentLimit: 100, subscriptionStatus: 'past_due' } 
    );
    const res = await reserveStudentImportQuota(db, 'job1', 'school1', 5, {});
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'SUBSCRIPTION_SUSPENDED');
  });

  // 10. transaction concurrente simulée -> une seule réservation
  await testCase('10. transaction concurrente simulée -> une seule réservation', async () => {
    const db = createDbMock(
      { status: 'VALIDATING_COMPLETE' },
      { studentCount: 10, studentLimit: 100, subscriptionStatus: 'active' }
    );
    // Simulate concurrent reservation
    db.runTransaction = async (cb) => {
      // First, simulate another transaction finished and updated the state to RUNNING
      db.getJobData().status = 'RUNNING'; 
      return await cb({
        get: async (ref) => ref.mockGet(),
        update: (ref, data) => ref.mockUpdate(data)
      });
    };
    const res = await reserveStudentImportQuota(db, 'job1', 'school1', 5, {});
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isNoOp, true); // It should back off
    assert.strictEqual(db.getSchoolData().studentCount, 10); // Remains untouched by THIS transaction
  });

  console.log(`\n=== RÉSULTATS: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

runTests();
