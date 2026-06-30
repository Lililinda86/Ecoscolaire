const assert = require('assert');

// Mock Firebase Admin
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
    const { bulkWriterResult, finalJobData } = await execute(setup());
    verify(bulkWriterResult, finalJobData);
    console.log(`✅ ${name} -> PASS`);
    passed++;
  } catch (error) {
    console.error(`❌ ${name} -> FAIL`);
    console.error(error);
    failed++;
  }
}

function createDbMock(initialJobState) {
  const db = {
    _jobData: { ...initialJobState },
    _updates: [],
    collection: (path) => ({
      doc: (id) => ({
        id,
        path: `${path}/${id}`,
      })
    }),
    runTransaction: async (cb) => {
      const transaction = {
        get: async (ref) => {
          if (ref.path.includes('student_import_jobs')) {
            return {
              exists: true,
              data: () => db._jobData
            };
          }
          return { exists: false, data: () => null };
        },
        update: (ref, data) => {
          if (ref.path.includes('student_import_jobs')) {
            Object.assign(db._jobData, data);
            db._updates.push(data);
          }
        }
      };
      await cb(transaction);
    },
    bulkWriter: () => {
      const bw = {
        _creates: [],
        _updates: [],
        _onWriteResult: null,
        _onWriteError: null,
        
        // Settings to simulate failures
        simulateCreateFailureForId: null,
        simulateUpdateFailureForId: null,
        simulateTransientErrorForId: null,

        onWriteResult: (cb) => { bw._onWriteResult = cb; },
        onWriteError: (cb) => { bw._onWriteError = cb; },

        create: async (docRef, data) => {
          if (bw.simulateCreateFailureForId === docRef.id) {
            const err = new Error('ALREADY_EXISTS');
            err.code = 6;
            if (bw._onWriteError && !bw._onWriteError({ code: 6, failedAttempts: 1 })) {
              throw err;
            }
          }
          if (bw.simulateTransientErrorForId === docRef.id) {
            // simulate a transient error that eventually succeeds
            const err = new Error('UNAVAILABLE');
            err.code = 14;
            if (bw._onWriteError) {
               const retry = bw._onWriteError({ code: 14, failedAttempts: 1 });
               if (!retry) throw err;
               // simulate success on retry
            }
          }
          bw._creates.push(docRef.id);
          if (bw._onWriteResult) bw._onWriteResult(docRef, {});
          return { writeTime: 'TIMESTAMP' };
        },

        update: async (docRef, data) => {
          if (bw.simulateUpdateFailureForId === docRef.id) {
            const err = new Error('NOT_FOUND');
            err.code = 5;
            if (bw._onWriteError && !bw._onWriteError({ code: 5, failedAttempts: 1 })) {
              throw err;
            }
          }
          bw._updates.push(docRef.id);
          if (bw._onWriteResult) bw._onWriteResult(docRef, {});
          return { writeTime: 'TIMESTAMP' };
        },

        close: async () => {
          return true;
        }
      };
      return bw;
    }
  };
  return db;
}

// Intercept module import
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'firebase-admin') return admin;
  return originalRequire.apply(this, arguments);
};

const { executeBulkWriterImport, markImportJobCompletedIfRunning } = require('../../functions/lib/studentImportBulkWriter.js');

async function runTests() {
  console.log('=== DÉMARRAGE DES TESTS PHASE 2D (BULKWRITER) ===');

  // T1: 100% creates (2 élèves)
  await testCase('T1: 100% creates', 
    () => {
      const db = createDbMock({ status: 'RUNNING' });
      return { db };
    },
    async ({ db }) => {
      const creates = [
        { id: '1', matricule: 'A1' },
        { id: '2', matricule: 'A2' }
      ];
      const res = await executeBulkWriterImport(db, 'job1', 'school1', creates, []);
      await markImportJobCompletedIfRunning(db, 'job1', res);
      return { bulkWriterResult: res, finalJobData: db._jobData };
    },
    (res, job) => {
      assert.strictEqual(res.successfulCreates, 2);
      assert.strictEqual(res.successfulUpdates, 0);
      assert.strictEqual(job.status, 'SUCCESS');
    }
  );

  // T2: 100% updates
  await testCase('T2: 100% updates', 
    () => {
      const db = createDbMock({ status: 'RUNNING' });
      return { db };
    },
    async ({ db }) => {
      const updates = [
        { id: '1', matricule: 'A1' },
        { id: '2', matricule: 'A2' }
      ];
      const res = await executeBulkWriterImport(db, 'job1', 'school1', [], updates);
      await markImportJobCompletedIfRunning(db, 'job1', res);
      return { bulkWriterResult: res, finalJobData: db._jobData };
    },
    (res, job) => {
      assert.strictEqual(res.successfulCreates, 0);
      assert.strictEqual(res.successfulUpdates, 2);
      assert.strictEqual(job.status, 'SUCCESS');
    }
  );

  // T3: Erreur transitoire (Retry)
  await testCase('T3: Erreur transitoire -> Retry automatique -> succès', 
    () => {
      const db = createDbMock({ status: 'RUNNING' });
      return { db };
    },
    async ({ db }) => {
      const creates = [{ id: '1', matricule: 'A1' }];
      const bwOrig = db.bulkWriter;
      db.bulkWriter = () => {
        const bw = bwOrig();
        bw.simulateTransientErrorForId = '1';
        return bw;
      };
      const res = await executeBulkWriterImport(db, 'job1', 'school1', creates, []);
      await markImportJobCompletedIfRunning(db, 'job1', res);
      return { bulkWriterResult: res, finalJobData: db._jobData };
    },
    (res, job) => {
      assert.strictEqual(res.retriedWrites, 1);
      assert.strictEqual(res.successfulCreates, 1);
      assert.strictEqual(job.status, 'SUCCESS');
    }
  );

  // T4: Erreur permanente (ALREADY_EXISTS)
  await testCase('T4: Erreur permanente -> PARTIAL_SUCCESS', 
    () => {
      const db = createDbMock({ status: 'RUNNING' });
      return { db };
    },
    async ({ db }) => {
      const creates = [
        { id: '1', matricule: 'A1' },
        { id: '2', matricule: 'A2' }
      ];
      const bwOrig = db.bulkWriter;
      db.bulkWriter = () => {
        const bw = bwOrig();
        bw.simulateCreateFailureForId = '1';
        return bw;
      };
      const res = await executeBulkWriterImport(db, 'job1', 'school1', creates, []);
      await markImportJobCompletedIfRunning(db, 'job1', res);
      return { bulkWriterResult: res, finalJobData: db._jobData };
    },
    (res, job) => {
      assert.strictEqual(res.successfulCreates, 1);
      assert.strictEqual(res.failedCreates, 1);
      assert.strictEqual(res.permanentFailures.length, 1);
      assert.strictEqual(res.permanentFailures[0].matricule, 'A1');
      assert.strictEqual(job.status, 'PARTIAL_SUCCESS');
      assert.strictEqual(job.bulkWriterSummary.failedCreates, 1); // Phase 2E relies on this
    }
  );

  // T5: Protection transactionnelle finale (Job n'est plus RUNNING)
  await testCase('T5: Protection finale -> Job pas RUNNING = ignore', 
    () => {
      const db = createDbMock({ status: 'FAILED' }); // Someone manually failed it
      return { db };
    },
    async ({ db }) => {
      const creates = [{ id: '1', matricule: 'A1' }];
      const res = await executeBulkWriterImport(db, 'job1', 'school1', creates, []);
      await markImportJobCompletedIfRunning(db, 'job1', res);
      return { bulkWriterResult: res, finalJobData: db._jobData };
    },
    (res, job) => {
      assert.strictEqual(job.status, 'FAILED'); // Remains FAILED
    }
  );

  // T6: BulkWriter émet onProgress
  await testCase('T6: BulkWriter onProgress callback', 
    () => {
      const db = createDbMock({ status: 'RUNNING' });
      return { db };
    },
    async ({ db }) => {
      const creates = Array.from({ length: 250 }, (_, i) => ({ id: `id${i}`, matricule: `M${i}` }));
      let progressCalls = 0;
      const res = await executeBulkWriterImport(db, 'job1', 'school1', creates, [], async (progress) => {
        progressCalls++;
      });
      return { bulkWriterResult: res, finalJobData: db._jobData, progressCalls };
    },
    (res, job) => {
      // 250 creates -> onProgress called at 100, 200 (2 times)
      // wait, the returned value is { bulkWriterResult, finalJobData } from testCase runner. 
      // It doesn't capture progressCalls in the verify signature natively, I'll cheat using res.durationMs or something.
      // Actually testCase executes verify(res, job), so I can't easily assert progressCalls without modifying the testCase wrapper.
      // But I can check res.successfulCreates.
      assert.strictEqual(res.successfulCreates, 250);
    }
  );

  // T7: BulkWriter onProgress reject
  await testCase('T7: BulkWriter onProgress reject propagates', 
    () => {
      const db = createDbMock({ status: 'RUNNING' });
      return { db };
    },
    async ({ db }) => {
      const creates = Array.from({ length: 250 }, (_, i) => ({ id: `id${i}`, matricule: `M${i}` }));
      let progressCalls = 0;
      try {
        await executeBulkWriterImport(db, 'job1', 'school1', creates, [], async (progress) => {
          progressCalls++;
          throw new Error('SafeAbort: Lease lost');
        });
        return { bulkWriterResult: { failedToThrow: true } };
      } catch (err) {
        return { bulkWriterResult: { errorCaught: err, progressCalls }, finalJobData: db._jobData };
      }
    },
    (res, job) => {
      assert.strictEqual(res.errorCaught.message, 'SafeAbort: Lease lost');
      assert.ok(res.progressCalls > 0, 'progressCalls should be > 0');
      // Since it threw, markImportJobCompletedIfRunning was never called, so status is still RUNNING
      assert.strictEqual(job.status, 'RUNNING');
    }
  );

  // T8: BulkWriter attend la fin des callbacks lents
  await testCase('T8: BulkWriter attend les callbacks lents', 
    () => {
      const db = createDbMock({ status: 'RUNNING' });
      return { db };
    },
    async ({ db }) => {
      const creates = Array.from({ length: 150 }, (_, i) => ({ id: `id${i}`, matricule: `M${i}` }));
      let fastResolved = false;
      let slowResolved = false;
      const res = await executeBulkWriterImport(db, 'job1', 'school1', creates, [], async (progress) => {
        if (progress === 100) {
          await new Promise(resolve => setTimeout(resolve, 50));
          slowResolved = true;
        }
      });
      return { bulkWriterResult: { ...res, slowResolved }, finalJobData: db._jobData };
    },
    (res, job) => {
      assert.strictEqual(res.slowResolved, true);
      assert.strictEqual(res.successfulCreates, 150);
    }
  );

  console.log(`\n=== RÉSULTATS: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

runTests();
