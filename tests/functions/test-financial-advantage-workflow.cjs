const assert = require('node:assert/strict');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST is required; refusing to use live Firestore.');
}

const admin = require('../../functions/node_modules/firebase-admin');
const {
  approveFinancialBenefit,
  approvePaymentMoratorium,
  createFinancialBenefit,
  createPaymentMoratorium,
  getStudentFinancialAccount,
  rejectFinancialBenefit,
  rejectPaymentMoratorium,
  submitFinancialBenefit,
  submitPaymentMoratorium
} = require('../../functions/lib/index');

const db = admin.firestore();
const suffix = `${Date.now()}-${process.pid}`;
const schoolId = `advantage-school-${suffix}`;
const otherSchoolId = `advantage-other-${suffix}`;
const studentId = `advantage-student-${suffix}`;
const classId = `advantage-class-${suffix}`;
const yearId = `advantage-year-${suffix}`;
const secretaryId = `advantage-secretary-${suffix}`;
const directorId = `advantage-director-${suffix}`;
const teacherId = `advantage-teacher-${suffix}`;
const crossSchoolSecretaryId = `advantage-cross-${suffix}`;
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
const benefitInput = (requestId, overrides = {}) => ({
  requestId,
  schoolId,
  studentId,
  academicYear,
  benefitType: 'SCHOLARSHIP',
  paymentType: 'TUITION',
  mode: 'FIXED_AMOUNT',
  value: 10000,
  installment: 'T1',
  stackable: true,
  reason: 'Aide financière documentée',
  maximumUses: 1,
  ...overrides
});
const moratoriumInput = (requestId, overrides = {}) => ({
  requestId,
  schoolId,
  studentId,
  academicYear,
  paymentType: 'tuition',
  installment: 'T2',
  effectiveDueDate: '2027-02-10',
  reason: 'Délai accordé par la direction',
  ...overrides
});

(async () => {
  await Promise.all([
    db.collection('users').doc(secretaryId).set({
      role: 'secretary', schoolId, isActive: true, name: 'Secrétaire'
    }),
    db.collection('users').doc(directorId).set({
      role: 'director', schoolId, isActive: true, name: 'Direction'
    }),
    db.collection('users').doc(teacherId).set({
      role: 'teacher', schoolId, isActive: true
    }),
    db.collection('users').doc(crossSchoolSecretaryId).set({
      role: 'secretary', schoolId: otherSchoolId, isActive: true
    }),
    db.collection('schools').doc(schoolId).set({
      name: 'École Avantages', academicYear, activeAcademicYearId: yearId, active: true,
      subscriptionStatus: 'active',
      globalFees: { feeT1: 50000, feeT2: 40000, feeT3: 30000, feeTransport: 0, feeUniforms: 0 },
      classFees: { CP: { registration: 15000, tuition: 120000, t1: 50000, t2: 40000, t3: 30000 } },
      paymentDeadlines: { registrationFee: '2026-08-15' }
    }),
    db.collection('schools').doc(otherSchoolId).set({
      name: 'Autre école', academicYear, active: true
    }),
    db.collection('academicYears').doc(yearId).set({
      schoolId, name: academicYear, status: 'active',
      tuitionPaymentDeadlines: { T1: '2026-09-05', T2: '2027-01-10', T3: '2027-04-10' }
    }),
    db.collection('classes').doc(classId).set({
      schoolId, name: 'CP', level: 'primary', cycle: 'primary'
    }),
    db.collection('students').doc(studentId).set({
      id: studentId, schoolId, name: 'Élève Workflow', matricule: 'ADV-001',
      classId, academicYearId: yearId, academicYear, usesTransport: false
    }),
    db.collection('studentPrivate').doc(studentId).set({ id: studentId, studentId, schoolId }),
    db.collection('studentFinance').doc(studentId).set({
      id: studentId, studentId, schoolId, registrationFeeExpected: 15000,
      registrationFeePaid: 0, feeT1: 0, feeT2: 0, feeT3: 0
    })
  ]);

  const initial = await account(secretaryId);
  assert.equal(initial.lines.find(line => line.key === 'tuition:T1').netExpectedAmount, 50000);

  const draft = await createFinancialBenefit.run(
    benefitInput(`draft_${suffix}`.replace(/[^A-Za-z0-9_-]/g, '_')),
    context(secretaryId)
  );
  assert.equal(draft.status, 'draft');
  await expectFailure(
    approveFinancialBenefit.run({ benefitId: draft.benefitId }, context(directorId)),
    'BENEFIT_NOT_APPROVABLE'
  );
  assert.equal((await account(secretaryId)).lines.find(line => line.key === 'tuition:T1').netExpectedAmount, 50000,
    'draft benefit does not alter debt');

  const replay = await createFinancialBenefit.run(
    benefitInput(`draft_${suffix}`.replace(/[^A-Za-z0-9_-]/g, '_')),
    context(secretaryId)
  );
  assert.equal(replay.idempotentReplay, true);

  const pending = await submitFinancialBenefit.run({ benefitId: draft.benefitId }, context(secretaryId));
  assert.equal(pending.status, 'pending');
  assert.equal((await account(secretaryId)).lines.find(line => line.key === 'tuition:T1').netExpectedAmount, 50000,
    'pending benefit does not alter debt');

  await expectFailure(
    createFinancialBenefit.run(benefitInput(`teacher_${suffix}`, { installment: 'T2' }), context(teacherId)),
    'PERMISSION_DENIED'
  );
  await expectFailure(
    createFinancialBenefit.run(benefitInput(`cross_${suffix}`, { installment: 'T2' }), context(crossSchoolSecretaryId)),
    'CROSS_SCHOOL_DENIED'
  );

  const approved = await approveFinancialBenefit.run({ benefitId: draft.benefitId }, context(directorId));
  assert.equal(approved.status, 'approved');
  assert.equal((await account(secretaryId)).lines.find(line => line.key === 'tuition:T1').netExpectedAmount, 40000,
    'only approved benefit alters debt');

  const rejectedDraft = await createFinancialBenefit.run(
    benefitInput(`reject_${suffix}`, {
      benefitType: 'FAMILY_DISCOUNT', mode: 'PERCENTAGE', value: 10, installment: 'T2'
    }),
    context(secretaryId)
  );
  await submitFinancialBenefit.run({ benefitId: rejectedDraft.benefitId }, context(secretaryId));
  const rejected = await rejectFinancialBenefit.run(
    { benefitId: rejectedDraft.benefitId, reason: 'Justificatif manquant' },
    context(directorId)
  );
  assert.equal(rejected.status, 'rejected');
  assert.equal((await account(secretaryId)).lines.find(line => line.key === 'tuition:T2').netExpectedAmount, 40000,
    'rejected benefit does not alter debt');
  const oversized = await createFinancialBenefit.run(
    benefitInput(`oversized_${suffix}`, { installment: 'T3', value: 30001 }),
    context(secretaryId)
  );
  await submitFinancialBenefit.run({ benefitId: oversized.benefitId }, context(secretaryId));
  await expectFailure(
    approveFinancialBenefit.run({ benefitId: oversized.benefitId }, context(directorId)),
    'BENEFIT_EXCEEDS_SCOPE'
  );
  assert.equal((await account(secretaryId)).lines.find(line => line.key === 'tuition:T3').netExpectedAmount, 30000,
    'an excessive reduction is never approved');


  await db.collection('financialBenefits').doc(`expired-${suffix}`).set({
    id: `expired-${suffix}`, schoolId, studentId, academicYear,
    benefitType: 'EXCEPTIONAL_DISCOUNT', paymentType: 'TUITION', installment: 'T3',
    mode: 'FIXED_AMOUNT', value: 5000, stackable: true, reason: 'Ancienne aide',
    validUntil: '2020-01-01', status: 'approved', usageCount: 0, maximumUses: 1, appliedTargets: []
  });
  assert.equal((await account(secretaryId)).lines.find(line => line.key === 'tuition:T3').netExpectedAmount, 30000,
    'expired benefit does not alter debt');

  const moratoriumDraft = await createPaymentMoratorium.run(
    moratoriumInput(`moratorium_${suffix}`.replace(/[^A-Za-z0-9_-]/g, '_')),
    context(secretaryId)
  );
  assert.equal(moratoriumDraft.status, 'draft');
  let t2 = (await account(secretaryId)).lines.find(line => line.key === 'tuition:T2');
  assert.equal(t2.effectiveDueDate, '2027-01-10', 'draft moratorium does not alter the deadline');
  assert.equal(t2.netExpectedAmount, 40000, 'draft moratorium does not alter debt');
  await expectFailure(
    approvePaymentMoratorium.run({ moratoriumId: moratoriumDraft.moratoriumId }, context(directorId)),
    'MORATORIUM_NOT_APPROVABLE'
  );

  await submitPaymentMoratorium.run({ moratoriumId: moratoriumDraft.moratoriumId }, context(secretaryId));
  t2 = (await account(secretaryId)).lines.find(line => line.key === 'tuition:T2');
  assert.equal(t2.effectiveDueDate, '2027-01-10', 'pending moratorium does not alter the deadline');

  await approvePaymentMoratorium.run({ moratoriumId: moratoriumDraft.moratoriumId }, context(directorId));
  t2 = (await account(secretaryId)).lines.find(line => line.key === 'tuition:T2');
  assert.equal(t2.originalDueDate, '2027-01-10');
  assert.equal(t2.effectiveDueDate, '2027-02-10');
  assert.equal(t2.netExpectedAmount, 40000, 'approved moratorium never changes debt');

  await expectFailure(
    createPaymentMoratorium.run(
      moratoriumInput(`invalid-date_${suffix}`, { installment: 'T3', effectiveDueDate: '2027-04-01' }),
      context(secretaryId)
    ),
    'INVALID_MORATORIUM_DATE'
  );
  await expectFailure(
    createPaymentMoratorium.run(
      moratoriumInput(`cross-mora_${suffix}`, { installment: 'T3' }),
      context(crossSchoolSecretaryId)
    ),
    'CROSS_SCHOOL_DENIED'
  );

  const rejectedMoratorium = await createPaymentMoratorium.run(
    moratoriumInput(`reject-mora_${suffix}`, { installment: 'T3', effectiveDueDate: '2027-05-10' }),
    context(secretaryId)
  );
  await submitPaymentMoratorium.run({ moratoriumId: rejectedMoratorium.moratoriumId }, context(secretaryId));
  await rejectPaymentMoratorium.run(
    { moratoriumId: rejectedMoratorium.moratoriumId, reason: 'Demande incomplète' },
    context(directorId)
  );
  const finalT3 = (await account(secretaryId)).lines.find(line => line.key === 'tuition:T3');
  assert.equal(finalT3.effectiveDueDate, '2027-04-10', 'rejected moratorium does not alter the deadline');

  const actions = (await db.collection('audit_logs').where('schoolId', '==', schoolId).get())
    .docs.map(document => document.data().action);
  for (const action of [
    'BENEFIT_CREATED', 'BENEFIT_SUBMITTED', 'BENEFIT_APPROVED', 'BENEFIT_REJECTED',
    'MORATORIUM_CREATED', 'MORATORIUM_SUBMITTED', 'MORATORIUM_APPROVED', 'MORATORIUM_REJECTED'
  ]) {
    assert.ok(actions.includes(action), `${action} is audited`);
  }

  console.log('financial advantage approval workflow tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

