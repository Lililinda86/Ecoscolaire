const assert = require('node:assert/strict');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST is required; refusing to use live Firestore.');
}

const admin = require('../../functions/node_modules/firebase-admin');
const {
  approveFinancialBenefit,
  cancelFinancialBenefit,
  closeCashDrawer,
  createFinancialBenefit,
  getCollectionQuote,
  recordCashPayment
} = require('../../functions/lib/index');
const { makeTuitionDiscountSlotId } = require('../../functions/lib/utils/discountHelpers');

const db = admin.firestore();
const suffix = `${Date.now()}-${process.pid}`;
const schoolId = `collections-school-${suffix}`;
const otherSchoolId = `other-school-${suffix}`;
const studentId = `collections-student-${suffix}`;
const classId = `collections-class-${suffix}`;
const secretaryId = `secretary-${suffix}`;
const ownerId = `owner-${suffix}`;
const directorId = `director-${suffix}`;
const inactiveId = `inactive-${suffix}`;
const crossSchoolId = `cross-school-${suffix}`;
const academicYear = '2026-2027';
const extraStudentId = label => `${label}-student-${suffix}`;

const context = uid => ({ auth: { uid } });
const businessCode = error => error?.details?.businessCode;
const expectFailure = async (promise, expected) => {
  try {
    await promise;
    throw new Error(`Expected ${expected}`);
  } catch (error) {
    if (error.message === `Expected ${expected}`) throw error;
    if (expected.startsWith('code:')) {
      assert.equal(error.code, expected.slice(5));
    } else {
      assert.equal(businessCode(error), expected, error.stack || error.message);
    }
  }
};

const quote = (uid, type, extra = {}) => getCollectionQuote.run({
  schoolId, studentId, academicYear, type, ...extra
}, context(uid));

const pay = (uid, requestId, amount, type, extra = {}) => recordCashPayment.run({
  schoolId, studentId, academicYear, requestId, amount, type, ...extra
}, context(uid));

const createBenefit = (uid, requestId, overrides = {}) => createFinancialBenefit.run({
  schoolId,
  studentId,
  academicYear,
  requestId,
  benefitType: 'SCHOLARSHIP',
  paymentType: 'TUITION',
  mode: 'FIXED_AMOUNT',
  value: 10000,
  installment: 'T1',
  stackable: true,
  reason: 'Test fictif de bourse',
  ...overrides
}, context(uid));

(async () => {
  await Promise.all([
    db.collection('users').doc(secretaryId).set({ role: 'secretary', schoolId, isActive: true }),
    db.collection('users').doc(ownerId).set({ role: 'owner', schoolId, isActive: true }),
    db.collection('users').doc(directorId).set({ role: 'director', schoolId, isActive: true }),
    db.collection('users').doc(inactiveId).set({ role: 'secretary', schoolId, isActive: false }),
    db.collection('users').doc(crossSchoolId).set({ role: 'secretary', schoolId: otherSchoolId, isActive: true }),
    db.collection('schools').doc(schoolId).set({
      name: 'Collections test school', academicYear, active: true,
      subscriptionStatus: 'active', globalFees: { feeT1: 70000, feeT2: 70000, feeT3: 70000, feeTransport: 6000 }
    }),
    db.collection('schools').doc(otherSchoolId).set({ name: 'Other school', academicYear, active: true }),
    db.collection('classes').doc(classId).set({ schoolId, name: 'CP', level: 'primary' }),
    db.collection('students').doc(studentId).set({
      id: studentId, schoolId, name: 'Élève fictif', matricule: 'TEST-COLLECTIONS',
      classId, academicYear, gender: 'M', section: 'francophone'
    }),
    db.collection('studentFinance').doc(studentId).set({
      id: studentId, studentId, schoolId,
      registrationFeeExpected: 15000, registrationFeePaid: 0, registrationFeeStatus: 'unpaid',
      feeT1: 70000, feeT2: 70000, feeT3: 70000, transportMonthlyFee: 6000
    })
  ]);

  // Permission matrix and scholarship approval.
  await expectFailure(createBenefit(secretaryId, `secretary-create-${suffix}`), 'PERMISSION_DENIED');
  const scholarship = await createBenefit(ownerId, `owner-scholarship-${suffix}`);
  assert.equal(scholarship.status, 'draft');
  await expectFailure(approveFinancialBenefit.run({ benefitId: scholarship.benefitId }, context(secretaryId)), 'PERMISSION_DENIED');
  const approved = await approveFinancialBenefit.run({ benefitId: scholarship.benefitId }, context(ownerId));
  assert.equal(approved.status, 'approved');

  const directorBenefit = await createBenefit(directorId, `director-t3-${suffix}`, {
    installment: 'T3', value: 1000, reason: 'Bourse fictive approuvée par direction'
  });
  assert.equal((await approveFinancialBenefit.run({ benefitId: directorBenefit.benefitId }, context(directorId))).status, 'approved');

  const t1Quote = await quote(secretaryId, 'tuition', { installment: 'T1' });
  assert.deepEqual({
    gross: t1Quote.grossExpectedAmount,
    discount: t1Quote.discountAmount,
    net: t1Quote.netExpectedAmount,
    paid: t1Quote.previousPaid,
    remaining: t1Quote.remainingBalance
  }, { gross: 70000, discount: 10000, net: 60000, paid: 0, remaining: 60000 });

  const partial = await pay(secretaryId, `tuition-partial-${suffix}`, 30000, 'tuition', { installment: 'T1' });
  assert.equal(partial.remainingBalance, 30000);
  const full = await pay(secretaryId, `tuition-full-${suffix}`, 30000, 'tuition', { installment: 'T1' });
  assert.equal(full.remainingBalance, 0);
  await expectFailure(pay(secretaryId, `tuition-over-${suffix}`, 1, 'tuition', { installment: 'T1' }), 'NO_REMAINING_BALANCE');
  const t2Quote = await quote(secretaryId, 'tuition', { installment: 'T2' });
  assert.equal(t2Quote.discountAmount, 0, 'T1 scholarship must not affect T2');
  const t3Quote = await quote(secretaryId, 'tuition', { installment: 'T3' });
  assert.equal(t3Quote.discountAmount, 1000, 'only the director-approved T3 benefit must affect T3');

  // Transport voucher: September only, partial then complete.
  const voucher = await createBenefit(ownerId, `transport-voucher-${suffix}`, {
    benefitType: 'DISCOUNT_VOUCHER', paymentType: 'TRANSPORT', mode: 'FIXED_AMOUNT', value: 1000,
    installment: undefined, transportStartPeriod: '2026-09', transportEndPeriod: '2026-09',
    reference: `BON-${suffix}`, singleUse: true, maximumUses: 1, reason: 'Bon fictif transport'
  });
  await approveFinancialBenefit.run({ benefitId: voucher.benefitId }, context(ownerId));
  const september = await quote(secretaryId, 'transport', { period: '2026-09' });
  assert.deepEqual({ gross: september.grossExpectedAmount, discount: september.discountAmount, net: september.netExpectedAmount },
    { gross: 6000, discount: 1000, net: 5000 });
  const transportPartial = await pay(secretaryId, `transport-partial-${suffix}`, 3000, 'transport', { period: '2026-09' });
  assert.equal(transportPartial.remainingBalance, 2000);
  const transportFull = await pay(secretaryId, `transport-full-${suffix}`, 2000, 'transport', { period: '2026-09' });
  assert.equal(transportFull.remainingBalance, 0);
  await expectFailure(pay(secretaryId, `transport-over-${suffix}`, 1000, 'transport', { period: '2026-09' }), 'NO_REMAINING_BALANCE');
  const october = await quote(secretaryId, 'transport', { period: '2026-10' });
  assert.equal(october.discountAmount, 0);
  assert.equal(october.remainingBalance, 6000);
  await expectFailure(quote(secretaryId, 'transport'), 'INVALID_TRANSPORT_PERIOD');
  await expectFailure(quote(secretaryId, 'transport', { period: 'September' }), 'INVALID_TRANSPORT_PERIOD');
  await expectFailure(quote(secretaryId, 'transport', { period: '2027-07' }), 'PERIOD_OUTSIDE_ACADEMIC_YEAR');

  // Percentage benefits, stacking and temporal validity are calculated server-side.
  const percentageStudentId = extraStudentId('percentage');
  await Promise.all([
    db.collection('students').doc(percentageStudentId).set({
      id: percentageStudentId, schoolId, name: 'Élève pourcentage fictif', matricule: 'TEST-PERCENT',
      classId, academicYear, gender: 'F', section: 'francophone'
    }),
    db.collection('studentFinance').doc(percentageStudentId).set({
      id: percentageStudentId, studentId: percentageStudentId, schoolId,
      feeT1: 70000, feeT2: 70000, feeT3: 70000, transportMonthlyFee: 6000
    })
  ]);
  const percentScholarship = await createBenefit(ownerId, `percent-scholarship-${suffix}`, {
    studentId: percentageStudentId, installment: 'T3', mode: 'PERCENTAGE', value: 25
  });
  await approveFinancialBenefit.run({ benefitId: percentScholarship.benefitId }, context(ownerId));
  const percentVoucher = await createBenefit(ownerId, `percent-voucher-${suffix}`, {
    studentId: percentageStudentId, installment: 'T3', benefitType: 'DISCOUNT_VOUCHER',
    mode: 'PERCENTAGE', value: 10, reference: `BON-PERCENT-${suffix}`,
    singleUse: true, maximumUses: 1
  });
  await approveFinancialBenefit.run({ benefitId: percentVoucher.benefitId }, context(ownerId));
  const percentageQuote = await quote(secretaryId, 'tuition', {
    studentId: percentageStudentId, installment: 'T3'
  });
  assert.equal(percentageQuote.discountAmount, 24500, '25% scholarship + 10% voucher must stack on gross');
  assert.equal(percentageQuote.netExpectedAmount, 45500);

  const invalidStudentId = extraStudentId('invalid-benefits');
  await Promise.all([
    db.collection('students').doc(invalidStudentId).set({
      id: invalidStudentId, schoolId, name: 'Élève invalidité fictif', matricule: 'TEST-INVALID',
      classId, academicYear, gender: 'M', section: 'francophone'
    }),
    db.collection('studentFinance').doc(invalidStudentId).set({
      id: invalidStudentId, studentId: invalidStudentId, schoolId,
      feeT1: 70000, feeT2: 70000, feeT3: 70000, transportMonthlyFee: 6000
    })
  ]);
  const expiredVoucher = await createBenefit(ownerId, `expired-voucher-${suffix}`, {
    studentId: invalidStudentId, benefitType: 'DISCOUNT_VOUCHER', reference: `BON-EXPIRED-${suffix}`,
    validUntil: '2000-01-01', value: 5000
  });
  await approveFinancialBenefit.run({ benefitId: expiredVoucher.benefitId }, context(ownerId));
  const cancelledVoucher = await createBenefit(ownerId, `cancelled-voucher-${suffix}`, {
    studentId: invalidStudentId, installment: 'T2', benefitType: 'DISCOUNT_VOUCHER',
    reference: `BON-CANCELLED-${suffix}`, value: 5000
  });
  await approveFinancialBenefit.run({ benefitId: cancelledVoucher.benefitId }, context(ownerId));
  await cancelFinancialBenefit.run({ benefitId: cancelledVoucher.benefitId, reason: 'Test d’annulation' }, context(ownerId));
  assert.equal((await quote(secretaryId, 'tuition', {
    studentId: invalidStudentId, installment: 'T1'
  })).discountAmount, 0, 'expired voucher must not apply');
  assert.equal((await quote(secretaryId, 'tuition', {
    studentId: invalidStudentId, installment: 'T2'
  })).discountAmount, 0, 'cancelled voucher must not apply');

  const conflictStudentId = extraStudentId('conflict');
  await Promise.all([
    db.collection('students').doc(conflictStudentId).set({
      id: conflictStudentId, schoolId, name: 'Élève conflit fictif', matricule: 'TEST-CONFLICT',
      classId, academicYear, gender: 'F', section: 'francophone'
    }),
    db.collection('studentFinance').doc(conflictStudentId).set({
      id: conflictStudentId, studentId: conflictStudentId, schoolId,
      feeT1: 70000, feeT2: 70000, feeT3: 70000, transportMonthlyFee: 6000
    })
  ]);
  const nonStackable = await createBenefit(ownerId, `non-stackable-${suffix}`, {
    studentId: conflictStudentId, installment: 'T2', stackable: false, value: 1000
  });
  const otherBenefit = await createBenefit(ownerId, `other-benefit-${suffix}`, {
    studentId: conflictStudentId, installment: 'T2', stackable: true, value: 1000
  });
  await approveFinancialBenefit.run({ benefitId: nonStackable.benefitId }, context(ownerId));
  await expectFailure(
    approveFinancialBenefit.run({ benefitId: otherBenefit.benefitId }, context(ownerId)),
    'NON_STACKABLE_BENEFIT_CONFLICT'
  );

  // A single-use voucher covering a range is consumed by its first month only.
  const singleUseStudentId = extraStudentId('single-use');
  await Promise.all([
    db.collection('students').doc(singleUseStudentId).set({
      id: singleUseStudentId, schoolId, name: 'Élève bon unique fictif', matricule: 'TEST-SINGLE',
      classId, academicYear, gender: 'M', section: 'francophone'
    }),
    db.collection('studentFinance').doc(singleUseStudentId).set({
      id: singleUseStudentId, studentId: singleUseStudentId, schoolId, transportMonthlyFee: 6000,
      feeT1: 70000, feeT2: 70000, feeT3: 70000
    })
  ]);
  const rangedVoucher = await createBenefit(ownerId, `ranged-voucher-${suffix}`, {
    studentId: singleUseStudentId, benefitType: 'DISCOUNT_VOUCHER', paymentType: 'TRANSPORT',
    installment: undefined, transportStartPeriod: '2026-09', transportEndPeriod: '2026-10',
    reference: `BON-RANGE-${suffix}`, singleUse: true, maximumUses: 1, value: 1000
  });
  await approveFinancialBenefit.run({ benefitId: rangedVoucher.benefitId }, context(ownerId));
  await pay(secretaryId, `single-use-september-${suffix}`, 5000, 'transport', {
    studentId: singleUseStudentId, period: '2026-09'
  });
  assert.equal((await quote(secretaryId, 'transport', {
    studentId: singleUseStudentId, period: '2026-10'
  })).discountAmount, 0, 'single-use voucher cannot be reused in another month');

  const transportStackStudentId = extraStudentId('transport-stack');
  await Promise.all([
    db.collection('students').doc(transportStackStudentId).set({
      id: transportStackStudentId, schoolId, name: 'Élève cumul transport fictif', matricule: 'TEST-TRANSPORT-STACK',
      classId, academicYear, gender: 'F', section: 'francophone'
    }),
    db.collection('studentFinance').doc(transportStackStudentId).set({
      id: transportStackStudentId, studentId: transportStackStudentId, schoolId,
      feeT1: 70000, feeT2: 70000, feeT3: 70000, transportMonthlyFee: 6000
    })
  ]);
  const transportScholarship = await createBenefit(ownerId, `transport-scholarship-${suffix}`, {
    studentId: transportStackStudentId, paymentType: 'TRANSPORT', installment: undefined,
    transportStartPeriod: '2026-09', transportEndPeriod: '2026-09', value: 1000
  });
  const transportStackVoucher = await createBenefit(ownerId, `transport-stack-voucher-${suffix}`, {
    studentId: transportStackStudentId, paymentType: 'TRANSPORT', installment: undefined,
    transportStartPeriod: '2026-09', transportEndPeriod: '2026-09',
    benefitType: 'DISCOUNT_VOUCHER', reference: `BON-TRANSPORT-STACK-${suffix}`,
    singleUse: true, maximumUses: 1, value: 500
  });
  await approveFinancialBenefit.run({ benefitId: transportScholarship.benefitId }, context(ownerId));
  await approveFinancialBenefit.run({ benefitId: transportStackVoucher.benefitId }, context(ownerId));
  const transportStackQuote = await quote(secretaryId, 'transport', {
    studentId: transportStackStudentId, period: '2026-09'
  });
  assert.equal(transportStackQuote.discountAmount, 1500);
  assert.equal(transportStackQuote.netExpectedAmount, 4500);

  // Existing approved tuitionDiscountSlots remain compatible with the generalized quote/payment path.
  const legacyStudentId = extraStudentId('legacy');
  await Promise.all([
    db.collection('students').doc(legacyStudentId).set({
      id: legacyStudentId, schoolId, name: 'Élève réduction legacy fictif', matricule: 'TEST-LEGACY',
      classId, academicYear, gender: 'F', section: 'francophone'
    }),
    db.collection('studentFinance').doc(legacyStudentId).set({
      id: legacyStudentId, studentId: legacyStudentId, schoolId,
      feeT1: 70000, feeT2: 70000, feeT3: 70000, transportMonthlyFee: 6000
    })
  ]);
  const legacyDiscountId = `legacy-discount-${suffix}`;
  const legacySlotId = makeTuitionDiscountSlotId({
    schoolId, studentId: legacyStudentId, academicYear, installment: 'T1'
  });
  await Promise.all([
    db.collection('tuitionDiscounts').doc(legacyDiscountId).set({
      id: legacyDiscountId, schoolId, studentId: legacyStudentId, academicYear, installment: 'T1',
      discountCode: `RED-LEGACY-${suffix}`, grossExpectedAmount: 70000,
      discountAmount: 5000, netExpectedAmount: 65000, reason: 'Compatibilité legacy', status: 'approved'
    }),
    db.collection('tuitionDiscountSlots').doc(legacySlotId).set({
      id: legacySlotId, schoolId, studentId: legacyStudentId, academicYear,
      installment: 'T1', discountId: legacyDiscountId
    })
  ]);
  const legacyQuote = await quote(secretaryId, 'tuition', {
    studentId: legacyStudentId, installment: 'T1'
  });
  assert.equal(legacyQuote.discountAmount, 5000);
  assert.equal(legacyQuote.netExpectedAmount, 65000);
  const conflictingLegacyBenefit = await createBenefit(ownerId, `legacy-conflict-${suffix}`, {
    studentId: legacyStudentId, installment: 'T1', value: 1000
  });
  await expectFailure(
    approveFinancialBenefit.run({ benefitId: conflictingLegacyBenefit.benefitId }, context(ownerId)),
    'LEGACY_DISCOUNT_CONFLICT'
  );

  // Idempotent double submit: one payment and one receipt.
  const duplicateRequest = `registration-double-${suffix}`;
  const counterBeforeDuplicate = (await db.collection('counters').doc(`receipts_${schoolId}`).get()).data()?.lastReceiptNumber || 0;
  const duplicateResults = await Promise.all([
    pay(secretaryId, duplicateRequest, 5000, 'registration_fee'),
    pay(secretaryId, duplicateRequest, 5000, 'registration_fee')
  ]);
  assert.equal(duplicateResults.filter(item => item.idempotentReplay === false).length, 1);
  assert.equal(duplicateResults.filter(item => item.idempotentReplay === true).length, 1);
  assert.equal((await db.collection('payments').where('requestId', '==', duplicateRequest).get()).size, 1);
  assert.equal((await db.collection('receipts').where('requestId', '==', duplicateRequest).get()).size, 1);
  assert.equal((await db.collection('counters').doc(`receipts_${schoolId}`).get()).data().lastReceiptNumber,
    counterBeforeDuplicate + 1, 'idempotent replay increments the receipt counter once');

  // Two concurrent payments cannot both spend the same T2 balance.
  await pay(secretaryId, `t2-prime-${suffix}`, 60000, 'tuition', { installment: 'T2' });
  const concurrent = await Promise.allSettled([
    pay(secretaryId, `t2-concurrent-a-${suffix}`, 8000, 'tuition', { installment: 'T2' }),
    pay(secretaryId, `t2-concurrent-b-${suffix}`, 8000, 'tuition', { installment: 'T2' })
  ]);
  assert.equal(concurrent.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter(item => item.status === 'rejected').length, 1);
  const t2After = await quote(secretaryId, 'tuition', { installment: 'T2' });
  assert.equal(t2After.previousPaid, 68000);
  assert.equal(t2After.remainingBalance, 2000);

  await expectFailure(pay(crossSchoolId, `cross-school-pay-${suffix}`, 1000, 'transport', { period: '2026-10' }), 'CROSS_SCHOOL_DENIED');
  await expectFailure(pay(inactiveId, `inactive-pay-${suffix}`, 1000, 'transport', { period: '2026-10' }), 'PERMISSION_DENIED');
  await expectFailure(recordCashPayment.run({
    schoolId, studentId, academicYear, requestId: `unauthenticated-${suffix}`, amount: 1000,
    type: 'transport', period: '2026-10'
  }, {}), 'UNAUTHENTICATED');

  // Receipt snapshots remain unchanged even if an Admin actor later changes the source benefit.
  const receiptBefore = (await db.collection('receipts').doc(partial.receiptId).get()).data();
  assert.deepEqual({
    gross: receiptBefore.benefits[0].grossExpectedAmount,
    discount: receiptBefore.benefits[0].discountAmount,
    net: receiptBefore.benefits[0].netExpectedAmount
  }, { gross: 70000, discount: 10000, net: 60000 });
  await db.collection('financialBenefits').doc(scholarship.benefitId).update({ value: 9999 });
  const receiptAfter = (await db.collection('receipts').doc(partial.receiptId).get()).data();
  assert.deepEqual(receiptAfter.benefits, receiptBefore.benefits);
  assert.equal(receiptAfter.discountAmount, 10000);

  const publicStudent = (await db.collection('students').doc(studentId).get()).data();
  for (const forbidden of ['financialBenefits', 'tuitionExpectedGross', 'tuitionDiscountTotal', 'transportExpectedNet']) {
    assert.equal(publicStudent[forbidden], undefined, `${forbidden} must not leak into students`);
  }

  // Cash closure includes tuition, registration and transport cash payments.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const paymentsToday = await db.collection('payments').where('schoolId', '==', schoolId).where('date', '==', today).get();
  const cashTotal = paymentsToday.docs.reduce((sum, item) => sum + item.data().amount, 0);
  const closure = await closeCashDrawer.run({
    schoolId, academicYear, date: today, openingBalance: 0, countedBalance: cashTotal, notes: ''
  }, context(secretaryId));
  const closureDoc = (await db.collection('cashClosures').doc(closure.closureId).get()).data();
  assert.equal(closureDoc.cashReceived, cashTotal);
  assert.ok(paymentsToday.docs.some(item => item.data().type === 'transport'));

  const auditActions = new Set((await db.collection('audit_logs').where('schoolId', '==', schoolId).get())
    .docs.map(item => item.data().action));
  for (const action of ['BENEFIT_CREATED', 'BENEFIT_APPROVED', 'BENEFIT_CANCELLED', 'BENEFIT_APPLIED', 'PAYMENT_CREATED', 'TRANSPORT_PAYMENT_CREATED', 'RECEIPT_CREATED']) {
    assert.equal(auditActions.has(action), true, `missing audit action ${action}`);
  }

  console.log('secretary collections emulator tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
