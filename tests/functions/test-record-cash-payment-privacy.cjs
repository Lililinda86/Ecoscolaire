const assert = require('node:assert/strict');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST is required; refusing to use live Firestore.');
}

const admin = require('../../functions/node_modules/firebase-admin');
const {
  recordCashPayment,
  updateStudentFinancialStatus
} = require('../../functions/lib/index');

const db = admin.firestore();
const suffix = `${Date.now()}-${process.pid}`;
const schoolId = `privacy-school-${suffix}`;
const studentId = `privacy-student-${suffix}`;
const classId = `privacy-class-${suffix}`;
const uid = `privacy-owner-${suffix}`;
const academicYear = '2026-2027';

const invokeCashPayment = (requestId, amount) => recordCashPayment.run({
  requestId,
  schoolId,
  studentId,
  amount,
  type: 'registration_fee',
  academicYear
}, { auth: { uid } });

(async () => {
  await Promise.all([
    db.collection('users').doc(uid).set({
      role: 'owner', schoolId, isActive: true, name: 'Privacy test owner'
    }),
    db.collection('schools').doc(schoolId).set({
      name: 'Privacy test school', academicYear, active: true, subscriptionStatus: 'active'
    }),
    db.collection('classes').doc(classId).set({
      name: 'Privacy test class', schoolId, level: 'primary'
    }),
    // This deliberately models a legacy public student with no finance projection.
    db.collection('students').doc(studentId).set({
      name: 'Privacy test student', matricule: 'PRIVACY-TEST', schoolId, classId,
      academicYear, active: true, registrationFeeExpected: 15000
    })
  ]);

  const firstRequestId = `privacy-partial-${suffix}`;
  const partial = await invokeCashPayment(firstRequestId, 5000);
  assert.equal(partial.idempotentReplay, false);

  const publicAfterPartial = (await db.collection('students').doc(studentId).get()).data();
  assert.equal(publicAfterPartial.registrationFeePaid, undefined);
  assert.equal(publicAfterPartial.registrationFeeStatus, undefined);

  const financeAfterPartial = (await db.collection('studentFinance').doc(studentId).get()).data();
  assert.equal(financeAfterPartial.schoolId, schoolId);
  assert.equal(financeAfterPartial.studentId, studentId);
  assert.equal(financeAfterPartial.registrationFeePaid, 5000);
  assert.equal(financeAfterPartial.registrationFeeStatus, 'partial');
  assert.equal(financeAfterPartial.registrationFeeExpected, undefined,
    'legacy finance fields must not be migrated automatically');

  const replay = await invokeCashPayment(firstRequestId, 5000);
  assert.equal(replay.idempotentReplay, true);
  assert.equal((await db.collection('payments').where('studentId', '==', studentId).get()).size, 1);
  assert.equal((await db.collection('receipts').where('studentId', '==', studentId).get()).size, 1);
  assert.equal((await db.collection('studentFinance').doc(studentId).get()).data().registrationFeePaid, 5000);

  const fullRequestId = `privacy-full-${suffix}`;
  const full = await invokeCashPayment(fullRequestId, 10000);
  assert.equal(full.idempotentReplay, false);
  assert.equal((await db.collection('studentFinance').doc(studentId).get()).data().registrationFeePaid, 15000);
  assert.equal((await db.collection('studentFinance').doc(studentId).get()).data().registrationFeeStatus, 'paid');
  assert.equal((await db.collection('payments').where('studentId', '==', studentId).get()).size, 2);
  assert.equal((await db.collection('receipts').where('studentId', '==', studentId).get()).size, 2);

  const paymentRef = db.collection('payments').doc(full.paymentId);
  const beforeDelete = await paymentRef.get();
  await paymentRef.delete();
  const afterDelete = await paymentRef.get();
  await updateStudentFinancialStatus.run({ before: beforeDelete, after: afterDelete }, {});

  const financeAfterCancellation = (await db.collection('studentFinance').doc(studentId).get()).data();
  assert.equal(financeAfterCancellation.registrationFeePaid, 5000);
  assert.equal(financeAfterCancellation.registrationFeeStatus, 'partial');
  assert.equal((await db.collection('students').doc(studentId).get()).data().registrationFeePaid, undefined);

  console.log('record cash payment privacy tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
