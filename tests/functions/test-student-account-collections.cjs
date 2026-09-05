const assert = require('node:assert/strict');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST is required; refusing to use live Firestore.');
}

const admin = require('../../functions/node_modules/firebase-admin');
const { getStudentFinancialAccount, recordCashCollection, reverseCashCollection } = require('../../functions/lib/index');

const db = admin.firestore();
const suffix = `${Date.now()}-${process.pid}`;
const schoolId = `account-school-${suffix}`;
const otherSchoolId = `account-other-school-${suffix}`;
const studentId = `account-student-${suffix}`;
const classId = `account-class-${suffix}`;
const yearId = `account-year-${suffix}`;
const secretaryId = `account-secretary-${suffix}`;
const ownerId = `account-owner-${suffix}`;
const teacherId = `account-teacher-${suffix}`;
const crossSchoolId = `account-cross-school-${suffix}`;
const academicYear = '2026-2027';
const context = uid => ({ auth: { uid } });
const businessCode = error => error?.details?.businessCode;

const expectFailure = async (promise, expected) => {
  try {
    await promise;
    assert.fail(`Expected ${expected}`);
  } catch (error) {
    if (error.code === 'ERR_ASSERTION') throw error;
    assert.equal(businessCode(error), expected, error.stack || error.message);
  }
};

const account = uid => getStudentFinancialAccount.run({ schoolId, studentId, academicYear }, context(uid));
const collect = (uid, requestId, allocations) => recordCashCollection.run({
  schoolId, studentId, academicYear, requestId, allocations
}, context(uid));
const reverse = (uid, collectionId, requestId) => reverseCashCollection.run({
  collectionId, requestId, reason: 'Erreur de saisie test'
}, context(uid));

(async () => {
  await Promise.all([
    db.collection('users').doc(secretaryId).set({ role: 'secretary', schoolId, isActive: true, name: 'Secrétaire Test' }),
    db.collection('users').doc(ownerId).set({ role: 'owner', schoolId, isActive: true, name: 'Direction Test' }),
    db.collection('users').doc(teacherId).set({ role: 'teacher', schoolId, isActive: true }),
    db.collection('users').doc(crossSchoolId).set({ role: 'secretary', schoolId: otherSchoolId, isActive: true }),
    db.collection('schools').doc(schoolId).set({
      name: 'École Compte Test', academicYear, activeAcademicYearId: yearId, active: true,
      subscriptionStatus: 'active', studentsCount: 1, studentLimit: 100,
      globalFees: { feeT1: 50000, feeT2: 40000, feeT3: 30000, feeTransport: 0, feeUniforms: 15000 },
      classFees: { CP: { registration: 15000, tuition: 120000, t1: 50000, t2: 40000, t3: 30000 } },
      transportPolicy: { feePolicyId: 'ITALO_PK_2026', billingPeriods: ['2026-09', '2026-10', '2026-11'] },
      feeCatalog: [{ id: 'exam', label: "Frais d'examen", amount: 5000, active: true, classIds: [classId] }]
    }),
    db.collection('schools').doc(otherSchoolId).set({ name: 'Autre école', academicYear, active: true }),
    db.collection('academicYears').doc(yearId).set({ schoolId, name: academicYear, status: 'active',
      tuitionPaymentDeadlines: { T1: '2026-09-01', T2: '2027-01-10', T3: '2027-04-10' } }),
    db.collection('classes').doc(classId).set({ schoolId, name: 'CP', level: 'primary', cycle: 'primary' }),
    db.collection('students').doc(studentId).set({ id: studentId, schoolId, name: 'Élève Compte Test',
      matricule: 'ACCOUNT-001', classId, academicYearId: yearId, academicYear, usesTransport: false }),
    db.collection('studentPrivate').doc(studentId).set({ id: studentId, studentId, schoolId }),
    db.collection('studentFinance').doc(studentId).set({ id: studentId, studentId, schoolId,
      registrationFeeExpected: 15000, registrationFeePaid: 0, feeT1: 0, feeT2: 0, feeT3: 0, feeUniforms: 15000 }),
    db.collection('financialBenefits').doc(`approved-${suffix}`).set({ id: `approved-${suffix}`, schoolId,
      studentId, academicYear, benefitType: 'SCHOLARSHIP', paymentType: 'TUITION', installment: 'T1',
      mode: 'FIXED_AMOUNT', value: 10000, stackable: true, reason: 'Bourse approuvée', status: 'approved',
      usageCount: 0, maximumUses: 1, appliedTargets: [] }),
    db.collection('financialBenefits').doc(`pending-${suffix}`).set({ id: `pending-${suffix}`, schoolId,
      studentId, academicYear, benefitType: 'EXCEPTIONAL_DISCOUNT', paymentType: 'TUITION', installment: 'T2',
      mode: 'FIXED_AMOUNT', value: 10000, stackable: true, reason: 'Réduction en attente', status: 'draft',
      usageCount: 0, maximumUses: 1, appliedTargets: [] }),
    db.collection('paymentMoratoriums').doc(`moratorium-${suffix}`).set({ id: `moratorium-${suffix}`, schoolId,
      studentId, academicYear, paymentType: 'tuition', installment: 'T2', status: 'approved',
      effectiveDueDate: '2027-02-10', reason: 'Moratoire approuvé' })
  ]);

  const initial = await account(secretaryId);
  const byKey = new Map(initial.lines.map(line => [line.key, line]));
  assert.equal(byKey.get('tuition:T1').grossExpectedAmount, 50000, 'class tariff is authoritative');
  assert.equal(byKey.get('tuition:T1').netExpectedAmount, 40000, 'approved scholarship is applied');
  assert.equal(byKey.get('tuition:T2').netExpectedAmount, 40000, 'pending reduction is ignored');
  assert.equal(byKey.get('tuition:T2').moratoriumStatus, 'ACTIVE');
  assert.equal(byKey.has('transport'), false, 'transport is absent when not used');
  assert.equal(byKey.get('uniforms').remainingBalance, 15000);
  assert.equal(byKey.get('other:exam').remainingBalance, 5000);

  await expectFailure(account(teacherId), 'PERMISSION_DENIED');
  await expectFailure(account(crossSchoolId), 'CROSS_SCHOOL_DENIED');
  await expectFailure(collect(teacherId, `unauthorized_${suffix}`.replace(/[^A-Za-z0-9_-]/g, '_'), [
    { type: 'tuition', installment: 'T1', amount: 1 }
  ]), 'PERMISSION_DENIED');
  await Promise.all([
    db.collection('students').doc(studentId).update({ usesTransport: true }),
    db.collection('studentPrivate').doc(studentId).update({ transportZonePk: 14,
      transportNeighborhood: 'Quartier test', transportPickupPoint: 'Point test' })
  ]);
  const transportEnabled = await account(secretaryId);
  assert.equal(transportEnabled.lines.find(line => line.key === 'transport').remainingBalance, 12000);

  const requestId = `multi_${suffix}`.replace(/[^A-Za-z0-9_-]/g, '_');
  const allocations = [
    { type: 'tuition', installment: 'T1', amount: 20000 },
    { type: 'transport', amount: 4000 },
    { type: 'uniforms', amount: 15000 },
    { type: 'other', feeId: 'exam', amount: 5000 }
  ];
  const first = await collect(secretaryId, requestId, allocations);
  assert.equal(first.amount, 44000);
  assert.equal(first.lineItems.length, 4);
  assert.equal(first.idempotentReplay, false);
  assert.equal(first.receiptId, first.collectionId);
  const receipt = (await db.collection('receipts').doc(first.receiptId).get()).data();
  assert.equal(receipt.lineItems.length, 4, 'one global receipt keeps every fee line');
  assert.equal(receipt.lineItems.reduce((sum, line) => sum + line.amount, 0), receipt.amount);
  assert.equal(receipt.schoolName, 'École Compte Test');
  assert.equal(receipt.studentName, 'Élève Compte Test');
  assert.equal(receipt.className, 'CP');
  assert.equal(receipt.academicYear, academicYear);
  assert.equal(receipt.paymentMethod, 'cash');
  assert.ok(receipt.createdAt, 'receipt has an authoritative timestamp');
  assert.equal(receipt.collectedByName, 'Secrétaire Test');
  assert.equal((await db.collection('paymentAllocations').where('collectionId', '==', first.collectionId).get()).size, 4);
  assert.equal((await db.collection('transportPaymentAllocations').where('paymentId', '==', first.collectionId).get()).size, 1);

  const replay = await collect(secretaryId, requestId, allocations);
  assert.equal(replay.idempotentReplay, true);
  assert.equal((await db.collection('payments').where('requestId', '==', requestId).get()).size, 1,
    'double submission creates no duplicate');
  await expectFailure(collect(secretaryId, requestId, [
    { type: 'tuition', installment: 'T1', amount: 19999 },
    { type: 'transport', amount: 4000 },
    { type: 'uniforms', amount: 15000 },
    { type: 'other', feeId: 'exam', amount: 5000 }
  ]), 'IDEMPOTENCY_CONFLICT');

  const afterFirst = await account(secretaryId);
  const afterByKey = new Map(afterFirst.lines.map(line => [line.key, line]));
  assert.equal(afterByKey.get('tuition:T1').previousPaid, 20000);
  assert.equal(afterByKey.get('tuition:T1').remainingBalance, 20000);
  assert.equal(afterByKey.get('transport').remainingBalance, 8000);
  assert.equal(afterByKey.get('uniforms').remainingBalance, 0);
  assert.equal(afterByKey.get('other:exam').remainingBalance, 0);

  const second = await collect(secretaryId, `second_${suffix}`.replace(/[^A-Za-z0-9_-]/g, '_'), [
    { type: 'tuition', installment: 'T1', amount: 10000 }
  ]);
  assert.equal(second.lineItems[0].remainingBalance, 10000, 'second partial payment uses previous allocations');
  assert.notEqual(second.receiptNumber, first.receiptNumber, 'receipt numbers are unique');
  const reversalRequestId = `reverse_${suffix}`.replace(/[^A-Za-z0-9_-]/g, '_');
  await expectFailure(reverse(secretaryId, first.collectionId, reversalRequestId), 'PERMISSION_DENIED');
  const reversal = await reverse(ownerId, first.collectionId, reversalRequestId);
  assert.equal(reversal.amount, -44000);
  assert.equal(reversal.idempotentReplay, false);
  assert.match(reversal.correctionReceiptNumber, /^ANN-/);
  const reversalReplay = await reverse(ownerId, first.collectionId, reversalRequestId);
  assert.equal(reversalReplay.idempotentReplay, true, 'reversal retry is deterministic');
  const originalAfterReversal = (await db.collection('payments').doc(first.collectionId).get()).data();
  const correction = (await db.collection('receipts').doc(reversal.correctionReceiptId).get()).data();
  assert.equal(originalAfterReversal.amount, 44000, 'the original collection remains immutable');
  assert.equal(correction.originalPaymentId, first.collectionId);
  assert.equal(correction.kind, 'PAYMENT_REVERSAL');
  assert.equal(correction.lineItems.length, 4);
  await expectFailure(collect(secretaryId, `over_${suffix}`.replace(/[^A-Za-z0-9_-]/g, '_'), [
    { type: 'tuition', installment: 'T1', amount: 30001 }
  ]), 'OVERPAYMENT_DENIED');

  const finalAccount = await account(secretaryId);
  assert.equal(finalAccount.lines.find(line => line.key === 'tuition:T1').remainingBalance, 30000);
  assert.equal(finalAccount.lines.find(line => line.key === 'transport').remainingBalance, 12000);
  assert.equal(finalAccount.lines.find(line => line.key === 'uniforms').remainingBalance, 15000);
  assert.equal(finalAccount.lines.find(line => line.key === 'other:exam').remainingBalance, 5000);
  console.log('student financial account and multi-fee collection tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
