const assert = require('node:assert/strict');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST is required; refusing to use live Firestore.');
}

const admin = require('../../functions/node_modules/firebase-admin');
const {
  closeCashDrawer,
  recordCashPayment,
  reversePayment,
} = require('../../functions/lib/index');

const db = admin.firestore();
const suffix = `${Date.now()}-${process.pid}`;
const academicYear = '2026-2027';
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Douala',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const ids = {
  schoolA: `cash-school-a-${suffix}`,
  schoolB: `cash-school-b-${suffix}`,
  yearA: `cash-year-a-${suffix}`,
  yearB: `cash-year-b-${suffix}`,
  classA: `cash-class-a-${suffix}`,
  classB: `cash-class-b-${suffix}`,
  studentA: `cash-student-a-${suffix}`,
  studentB: `cash-student-b-${suffix}`,
  secretaryA: `cash-secretary-a-${suffix}`,
  secretaryB: `cash-secretary-b-${suffix}`,
  ownerA: `cash-owner-a-${suffix}`,
  ownerB: `cash-owner-b-${suffix}`,
};

const context = (uid) => ({ auth: { uid } });
const businessCode = (error) => error?.details?.businessCode;
const expectBusinessFailure = async (promise, expectedCode) => {
  try {
    await promise;
    assert.fail(`Expected business failure ${expectedCode}`);
  } catch (error) {
    if (error.code === 'ERR_ASSERTION') throw error;
    assert.equal(businessCode(error), expectedCode, error.stack || error.message);
  }
};

const payment = (schoolId, studentId, uid, requestId, amount) => recordCashPayment.run({
  schoolId,
  studentId,
  academicYear,
  requestId,
  amount,
  type: 'registration_fee',
}, context(uid));

const reverse = (uid, paymentId, requestId) => reversePayment.run({
  paymentId,
  requestId,
  reason: 'Correction de caisse fictive',
}, context(uid));

const close = (schoolId, uid, countedBalance, notes = '') => closeCashDrawer.run({
  schoolId,
  academicYear,
  date: today,
  openingBalance: 0,
  countedBalance,
  notes,
}, context(uid));

const seedSchool = async ({ schoolId, yearId, classId, studentId }) => {
  await Promise.all([
    db.collection('schools').doc(schoolId).set({
      name: 'Cash integrity fixture school',
      academicYear,
      activeAcademicYearId: yearId,
      active: true,
      globalFees: { feeT1: 70_000, feeT2: 70_000, feeT3: 70_000, feeTransport: 4_000 },
      paymentDeadlines: {
        registrationFee: '2026-09-15',
        tuition: { T1: '2026-09-30', T2: '2027-01-31', T3: '2027-04-30' },
        transport: {},
      },
    }),
    db.collection('academicYears').doc(yearId).set({
      schoolId,
      name: academicYear,
      status: 'active',
    }),
    db.collection('classes').doc(classId).set({
      schoolId,
      name: 'CP',
      level: 'primary',
      isActive: true,
      section: 'francophone',
    }),
    db.collection('students').doc(studentId).set({
      id: studentId,
      schoolId,
      name: 'Élève fixture caisse',
      matricule: `CASH-${studentId}`,
      classId,
      academicYearId: yearId,
      academicYear,
      gender: 'F',
      section: 'francophone',
      usesTransport: false,
    }),
    db.collection('studentFinance').doc(studentId).set({
      id: studentId,
      studentId,
      schoolId,
      registrationFeeExpected: 15_000,
      registrationFeePaid: 0,
      registrationFeeStatus: 'unpaid',
      feeT1: 70_000,
      feeT2: 70_000,
      feeT3: 70_000,
    }),
  ]);
};

(async () => {
  await Promise.all([
    db.collection('users').doc(ids.secretaryA).set({
      role: 'secretary', schoolId: ids.schoolA, isActive: true,
    }),
    db.collection('users').doc(ids.secretaryB).set({
      role: 'secretary', schoolId: ids.schoolB, isActive: true,
    }),
    db.collection('users').doc(ids.ownerA).set({
      role: 'owner', schoolId: ids.schoolA, isActive: true,
    }),
    db.collection('users').doc(ids.ownerB).set({
      role: 'owner', schoolId: ids.schoolB, isActive: true,
    }),
    seedSchool({
      schoolId: ids.schoolA,
      yearId: ids.yearA,
      classId: ids.classA,
      studentId: ids.studentA,
    }),
    seedSchool({
      schoolId: ids.schoolB,
      yearId: ids.yearB,
      classId: ids.classB,
      studentId: ids.studentB,
    }),
  ]);

  // Simulate a valid payment already posted earlier in the deployment day.
  // The first ledger-aware operation must initialize from it without migration.
  await db.collection('payments').doc(`cash-legacy-${suffix}`).set({
    id: `cash-legacy-${suffix}`,
    paymentId: `cash-legacy-${suffix}`,
    schoolId: ids.schoolA,
    studentId: ids.studentA,
    academicYear,
    type: 'registration_fee',
    amount: 500,
    method: 'cash',
    status: 'completed',
    date: today,
    byRecordCashPayment: true,
  });

  // Payments and owner reversal before closure are included algebraically.
  const first = await payment(
    ids.schoolA, ids.studentA, ids.secretaryA, `cash-before-a-${suffix}`, 4_000,
  );
  const reversed = await reverse(ids.ownerA, first.paymentId, `cash-reverse-before-${suffix}`);
  assert.equal(reversed.amount, -4_000);

  const retained = await payment(
    ids.schoolA, ids.studentA, ids.secretaryA, `cash-before-b-${suffix}`, 3_000,
  );
  await expectBusinessFailure(
    reverse(ids.secretaryA, retained.paymentId, `cash-secretary-reverse-${suffix}`),
    'PERMISSION_DENIED',
  );
  await expectBusinessFailure(
    reverse(ids.ownerB, retained.paymentId, `cash-cross-reverse-${suffix}`),
    'CROSS_SCHOOL_DENIED',
  );

  // Two concurrent closures serialize on the same tenant/day ledger.
  const concurrentClosures = await Promise.allSettled([
    close(ids.schoolA, ids.secretaryA, 3_500),
    close(ids.schoolA, ids.secretaryA, 3_500),
  ]);
  assert.equal(concurrentClosures.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(concurrentClosures.filter((item) => item.status === 'rejected').length, 1);
  const closureResult = concurrentClosures.find((item) => item.status === 'fulfilled').value;
  const closureDoc = (await db.collection('cashClosures').doc(closureResult.closureId).get()).data();
  const schoolAPayments = await db.collection('payments')
    .where('schoolId', '==', ids.schoolA)
    .where('date', '==', today)
    .get();
  const schoolAActual = schoolAPayments.docs.reduce((sum, document) => sum + document.data().amount, 0);
  assert.equal(schoolAActual, 3_500);
  assert.equal(closureDoc.cashReceived, schoolAActual);

  const ledgerA = (await db.collection('cashLedgerDays').doc(closureResult.closureId).get()).data();
  assert.equal(ledgerA.status, 'closed');
  assert.equal(ledgerA.cashReceived, schoolAActual);

  // A closed day rejects new cash events without changing the closure.
  await expectBusinessFailure(
    payment(ids.schoolA, ids.studentA, ids.secretaryA, `cash-after-close-${suffix}`, 1_000),
    'CASH_DAY_CLOSED',
  );
  await expectBusinessFailure(
    reverse(ids.ownerA, retained.paymentId, `cash-reverse-after-${suffix}`),
    'CASH_DAY_CLOSED',
  );
  await assert.rejects(close(ids.schoolA, ids.secretaryA, 3_500), (error) => error.code === 'already-exists');
  await assert.rejects(close(ids.schoolA, ids.ownerB, 3_500), (error) => error.code === 'permission-denied');
  assert.deepEqual(
    (await db.collection('cashClosures').doc(closureResult.closureId).get()).data(),
    closureDoc,
  );

  // Payment/closure race: either payment is refused by the winner closure, or
  // closure retries and includes it. It must never produce a stale total.
  const race = await Promise.allSettled([
    payment(ids.schoolB, ids.studentB, ids.secretaryB, `cash-race-payment-${suffix}`, 2_000),
    close(ids.schoolB, ids.secretaryB, 0, 'Concurrence contrôlée'),
  ]);
  const raceClosure = race[1];
  assert.equal(raceClosure.status, 'fulfilled');
  const racePayment = race[0];
  if (racePayment.status === 'rejected') {
    assert.equal(businessCode(racePayment.reason), 'CASH_DAY_CLOSED');
  }

  const closureB = (await db.collection('cashClosures').doc(raceClosure.value.closureId).get()).data();
  const schoolBPayments = await db.collection('payments')
    .where('schoolId', '==', ids.schoolB)
    .where('date', '==', today)
    .get();
  const schoolBActual = schoolBPayments.docs.reduce((sum, document) => sum + document.data().amount, 0);
  assert.equal(closureB.cashReceived, schoolBActual);
  const ledgerB = (await db.collection('cashLedgerDays').doc(raceClosure.value.closureId).get()).data();
  assert.equal(ledgerB.status, 'closed');
  assert.equal(ledgerB.cashReceived, schoolBActual);

  console.log('cash closure integrity emulator tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
