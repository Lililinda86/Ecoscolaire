const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveStudentFinanceData,
  writeStudentFinanceProjection
} = require('../../functions/lib/studentFinanceProjection');

const snapshot = (data) => ({
  exists: data !== undefined,
  data: () => data
});

const createTransaction = () => {
  const calls = [];
  return {
    calls,
    update: (ref, data) => calls.push({ operation: 'update', ref, data }),
    set: (ref, data) => calls.push({ operation: 'set', ref, data })
  };
};

(() => {
  const resolved = resolveStudentFinanceData(
    { name: 'Legacy student', feeT1: 1000, tuitionPaid: 500 },
    snapshot({ id: 'student-1', studentId: 'student-1', schoolId: 'school-1', feeT1: 2000 })
  );
  assert.equal(resolved.feeT1, 2000, 'canonical projection must override legacy public finance');
  assert.equal(resolved.tuitionPaid, 500, 'legacy finance remains a read-only fallback before migration');
  assert.equal(resolved.name, undefined, 'public non-finance fields must not enter finance data');
})();

(() => {
  const transaction = createTransaction();
  writeStudentFinanceProjection({
    transaction,
    financeRef: 'studentFinance/student-1',
    financeSnapshot: snapshot(undefined),
    studentId: 'student-1',
    schoolId: 'school-1',
    patch: { tuitionPaid: 2500, tuitionStatus: 'partial' },
    actorId: 'system:test'
  });

  assert.equal(transaction.calls.length, 1);
  assert.equal(transaction.calls[0].operation, 'set');
  assert.equal(transaction.calls[0].ref, 'studentFinance/student-1');
  assert.equal(transaction.calls[0].data.schoolId, 'school-1');
  assert.equal(transaction.calls[0].data.studentId, 'student-1');
  assert.equal(transaction.calls[0].data.tuitionPaid, 2500);
  assert.equal(transaction.calls[0].data.feeT1, undefined, 'missing projection creation must not migrate legacy fields');
})();

(() => {
  const transaction = createTransaction();
  writeStudentFinanceProjection({
    transaction,
    financeRef: 'studentFinance/student-1',
    financeSnapshot: snapshot({ id: 'student-1', studentId: 'student-1', schoolId: 'school-1' }),
    studentId: 'student-1',
    schoolId: 'school-1',
    patch: { registrationFeePaid: 15000, registrationFeeStatus: 'paid' },
    actorId: 'cashier-1'
  });

  assert.equal(transaction.calls.length, 1);
  assert.equal(transaction.calls[0].operation, 'update');
  assert.equal(transaction.calls[0].ref, 'studentFinance/student-1');
})();

(() => {
  assert.throws(() => writeStudentFinanceProjection({
    transaction: createTransaction(),
    financeRef: 'studentFinance/student-1',
    financeSnapshot: snapshot({ id: 'student-1', studentId: 'student-1', schoolId: 'school-other' }),
    studentId: 'student-1',
    schoolId: 'school-1',
    patch: { tuitionPaid: 1000 },
    actorId: 'system:test'
  }), /identity mismatch/);
})();

(() => {
  const source = fs.readFileSync(path.join(__dirname, '../../functions/src/index.ts'), 'utf8');
  assert.doesNotMatch(source, /transaction\.update\(studentRef/,
    'active Functions paths must not update public students documents');
  assert.doesNotMatch(source, /student\.(?:feeAmount|feeT1|feeT2|feeT3|feeTransport|feeUniforms|financialBypass|registrationFeeExpected|registrationFeePaid|registrationFeeStatus|tuitionExpected|tuitionPaid|tuitionStatus|transportMonthlyFee|transportPaid)/,
    'active finance readers must use the canonical projection with legacy fallback');
  assert.equal((source.match(/writeStudentFinanceProjection\(\{/g) ?? []).length, 5,
    'all five active finance writer branches must target studentFinance');

  const collectionSource = fs.readFileSync(
    path.join(__dirname, '../../functions/src/secretaryCollections.ts'), 'utf8'
  );
  assert.doesNotMatch(collectionSource, /transaction\.(?:set|update)\(studentRef/,
    'generalized collection paths must never write financial data to public students');
  const cashPaymentSource = collectionSource.slice(collectionSource.indexOf('export const recordCashPayment'));
  assert.ok(
    cashPaymentSource.indexOf('if (paymentSnap.exists || receiptSnap.exists)')
      < cashPaymentSource.indexOf('const contextData = await readQuoteContext'),
    'idempotent payment replay must return before any finance projection write path'
  );
})();

console.log('student finance projection tests passed');
