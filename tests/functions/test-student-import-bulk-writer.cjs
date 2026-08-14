const assert = require('assert');

// Mock Firebase Admin before loading the compiled Functions module.
const admin = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => 'SERVER_TIMESTAMP'
    }
  }
};

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'firebase-admin') return admin;
  return originalRequire.apply(this, arguments);
};

const {
  executeDormantBulkWriterImport,
  executeBulkWriterImport,
  isRealStudentImportEnabled,
  markImportJobCompletedIfRunning
} = require('../../functions/lib/studentImportBulkWriter.js');

function createDbMock({ transientId, failedCreateId } = {}) {
  const writes = [];
  const job = { status: 'RUNNING' };
  return {
    writes,
    job,
    collection: (name) => ({
      doc: (id) => ({ id, path: `${name}/${id}` })
    }),
    runTransaction: async (callback) => callback({
      get: async () => ({ exists: true, data: () => job }),
      update: (_ref, data) => Object.assign(job, data)
    }),
    bulkWriter: () => {
      let onWriteError;
      let onWriteResult;
      return {
        onWriteError: (callback) => { onWriteError = callback; },
        onWriteResult: (callback) => { onWriteResult = callback; },
        create: async (ref, data) => {
          if (ref.id === failedCreateId) {
            const error = Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
            if (!onWriteError({ code: 6, failedAttempts: 1 })) throw error;
          }
          if (ref.id === transientId) {
            assert.strictEqual(onWriteError({ code: 14, failedAttempts: 1 }), true);
          }
          writes.push({ type: 'create', ref, data });
          onWriteResult(ref);
        },
        update: async (ref, data) => {
          writes.push({ type: 'update', ref, data });
          onWriteResult(ref);
        },
        close: async () => undefined
      };
    }
  };
}

async function runTests() {
  console.log('=== TEST BULKWRITER REAL-DATA SAFETY GUARD ===');

  assert.strictEqual(
    isRealStudentImportEnabled(),
    false,
    'Real student imports must remain disabled'
  );

  let bulkWriterCalled = false;
  const db = {
    bulkWriter: () => {
      bulkWriterCalled = true;
      throw new Error('BulkWriter must not be created while imports are disabled');
    }
  };

  await assert.rejects(
    executeBulkWriterImport(
      db,
      'job-disabled',
      'school-disabled',
      [{ id: 'student-disabled', matricule: 'DISABLED-1' }],
      []
    ),
    (error) => error instanceof Error && error.message === 'STUDENT_IMPORT_DISABLED'
  );

  assert.strictEqual(
    bulkWriterCalled,
    false,
    'The safety guard must reject before creating a BulkWriter'
  );

  console.log('PASS: STUDENT_IMPORT_DISABLED rejects before any BulkWriter operation');

  const behaviorDb = createDbMock();
  const behaviorResult = await executeDormantBulkWriterImport(
    behaviorDb,
    'job-dormant',
    'school-dormant',
    [{ id: 'create-1', matricule: 'C1', feeT1: 99 }],
    [{ id: 'update-1', matricule: 'U1', feeT2: 88 }]
  );
  assert.deepStrictEqual(
    [behaviorResult.successfulCreates, behaviorResult.successfulUpdates],
    [1, 1]
  );
  assert.strictEqual('feeT1' in behaviorDb.writes[0].data, false);
  assert.strictEqual('feeT2' in behaviorDb.writes[1].data, false);
  await markImportJobCompletedIfRunning(behaviorDb, 'job-dormant', behaviorResult);
  assert.strictEqual(behaviorDb.job.status, 'SUCCESS');
  console.log('PASS: dormant core preserves create/update and successful finalization behavior');

  const retryDb = createDbMock({ transientId: 'retry-1' });
  const retryResult = await executeDormantBulkWriterImport(
    retryDb,
    'job-retry',
    'school-dormant',
    [{ id: 'retry-1', matricule: 'R1' }],
    []
  );
  assert.strictEqual(retryResult.retriedWrites, 1);
  assert.strictEqual(retryResult.successfulCreates, 1);
  console.log('PASS: dormant core preserves transient retry behavior');

  const failureDb = createDbMock({ failedCreateId: 'failed-1' });
  const failureResult = await executeDormantBulkWriterImport(
    failureDb,
    'job-failure',
    'school-dormant',
    [
      { id: 'failed-1', matricule: 'F1' },
      { id: 'created-1', matricule: 'C1' }
    ],
    []
  );
  assert.strictEqual(failureResult.failedCreates, 1);
  assert.strictEqual(failureResult.successfulCreates, 1);
  assert.strictEqual(failureResult.permanentFailures[0].matricule, 'F1');
  await markImportJobCompletedIfRunning(failureDb, 'job-failure', failureResult);
  assert.strictEqual(failureDb.job.status, 'PARTIAL_SUCCESS');
  console.log('PASS: dormant core preserves permanent failure and partial-success behavior');

  const progressDb = createDbMock();
  const progressValues = [];
  let callbackFinished = false;
  const progressResult = await executeDormantBulkWriterImport(
    progressDb,
    'job-progress',
    'school-dormant',
    Array.from({ length: 100 }, (_, index) => ({ id: `p-${index}`, matricule: `P${index}` })),
    [],
    async (progress) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      progressValues.push(progress);
      callbackFinished = true;
    }
  );
  assert.strictEqual(progressResult.successfulCreates, 100);
  assert.deepStrictEqual(progressValues, [100]);
  assert.strictEqual(callbackFinished, true);
  console.log('PASS: dormant core waits for progress callbacks');

  const rejectedProgressDb = createDbMock();
  await assert.rejects(
    executeDormantBulkWriterImport(
      rejectedProgressDb,
      'job-progress-reject',
      'school-dormant',
      Array.from({ length: 100 }, (_, index) => ({ id: `r-${index}`, matricule: `R${index}` })),
      [],
      async () => { throw new Error('SafeAbort: Lease lost'); }
    ),
    /SafeAbort: Lease lost/
  );
  console.log('PASS: dormant core propagates rejected progress callbacks');
}

runTests().catch((error) => {
  console.error('FAIL: BulkWriter real-data safety guard');
  console.error(error);
  process.exit(1);
});
