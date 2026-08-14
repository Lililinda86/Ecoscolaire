const assert = require('assert');
const Module = require('module');

let firestoreCalled = false;
let storageCalled = false;

const adminMock = {
  initializeApp: () => undefined,
  firestore: () => {
    firestoreCalled = true;
    throw new Error('Firestore must not be accessed while imports are disabled');
  },
  storage: () => {
    storageCalled = true;
    throw new Error('Storage must not be accessed while imports are disabled');
  }
};
adminMock.firestore.FieldValue = { serverTimestamp: () => 'MOCK_TIMESTAMP' };

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'firebase-admin') return adminMock;
  return originalRequire.apply(this, arguments);
};

const { processStudentImportJob } = require('../../functions/lib/importStudents.js');

async function runTests() {
  console.log('=== TEST IMPORT PROCESSOR RUNTIME KILL SWITCH ===');

  await processStudentImportJob.run({
    data: { data: () => ({ status: 'PENDING' }) },
    params: { jobId: 'disabled-job' }
  });

  assert.strictEqual(firestoreCalled, false);
  assert.strictEqual(storageCalled, false);
  console.log('PASS: processor exits before Firestore, Storage, quota, counters or BulkWriter');
}

runTests().catch((error) => {
  console.error('FAIL: import processor crossed the runtime kill switch');
  console.error(error);
  process.exit(1);
});
