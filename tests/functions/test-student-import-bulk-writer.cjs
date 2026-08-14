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
  executeBulkWriterImport,
  isRealStudentImportEnabled
} = require('../../functions/lib/studentImportBulkWriter.js');

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
}

runTests().catch((error) => {
  console.error('FAIL: BulkWriter real-data safety guard');
  console.error(error);
  process.exit(1);
});
