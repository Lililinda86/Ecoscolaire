const assert = require('node:assert/strict');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required; live database refused.');
const admin = require('../../functions/node_modules/firebase-admin');
const api = require('../../functions/lib/index');
const { prospectivePeriod, revisePeriodFees } = require('../../functions/lib/studentTransportPlan');
const db = admin.firestore();
const suffix = `${Date.now()}-${process.pid}`;
const schoolId = `allfees-school-${suffix}`, yearId = `allfees-year-${suffix}`, secretaryId = `allfees-sec-${suffix}`, directorId = `allfees-dir-${suffix}`;
const academicYear = '2026-2027';
const ctx = uid => ({ auth: { uid } });
const call = (name, payload, uid = directorId) => api[name].run({ schoolId, ...payload }, ctx(uid));
const documents = [];
async function seed(collection, key, data) { const ref = db.collection(collection).doc(key); documents.push(ref); await ref.set(data); }
const students = {};
(async () => {
  assert.equal(prospectivePeriod('2026-12-15'), '2027-01');
  assert.deepEqual(revisePeriodFees({ '2026-09': 4000, '2026-10': 4000 }, ['2026-09', '2026-10', '2026-11'], '2026-10', 5000), { '2026-09': 4000, '2026-10': 4000, '2026-11': 5000 });
  await seed('users', secretaryId, { schoolId, role: 'secretary', isActive: true });
  await seed('users', directorId, { schoolId, role: 'director', isActive: true });
  await seed('schools', schoolId, { name: 'All fees emulator', academicYear, activeAcademicYearId: yearId, active: true, subscriptionStatus: 'active',
    classFees: { Nursery: { registration: 15000, t1: 60000, t2: 50000, t3: 40000 }, CP: { registration: 15000, t1: 60000, t2: 50000, t3: 40000 }, Form1: { registration: 15000, t1: 60000, t2: 50000, t3: 40000 } },
    transportPolicy: { feePolicyId: 'ITALO_PK_2026', billingPeriods: ['2026-09', '2026-10', '2026-11'] } });
  await seed('academicYears', yearId, { schoolId, name: academicYear, status: 'active' });
  for (const [cycle, name] of [['nursery', 'Nursery'], ['primary', 'CP'], ['secondary', 'Form1']]) {
    const classId = `allfees-class-${cycle}-${suffix}`;
    await seed('classes', classId, { schoolId, name, cycle });
    for (const pk of [18, 36]) {
      const studentId = `allfees-student-${cycle}-${pk}-${suffix}`; students[`${cycle}${pk}`] = studentId;
      await seed('students', studentId, { id: studentId, schoolId, classId, academicYearId: yearId, academicYear, usesTransport: true, name: `${cycle}${pk}` });
      await seed('studentPrivate', studentId, { id: studentId, studentId, schoolId, transportZonePk: pk });
      await seed('studentFinance', studentId, { id: studentId, studentId, schoolId, registrationFeeExpected: 15000, registrationFeePaid: 0 });
      const before = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
      if (cycle === 'nursery' || cycle === 'secondary') assert.equal(before.lines.some(l => l.type === 'transport'), false, 'no retroactive nursery or secondary debt');
      const preview = await call('getSchoolFeeCatalog', { classId, zonePk: pk }, secretaryId);
      assert.equal(preview.transportTariff.monthlyGrossAmount, cycle === 'secondary' ? 0 : pk === 18 ? 4000 : 5000);
      assert.equal((await db.collection('studentTransportPlans').where('studentId', '==', studentId).get()).size, 0, 'tariff preview never creates a subscription');
      const plan = await call('setStudentTransportPlan', { studentId, usesTransport: true, zonePk: pk });
      assert.equal(plan.monthlyGrossAmount, cycle === 'secondary' ? 0 : pk === 18 ? 4000 : 5000);
      const account = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
      const transport = account.lines.filter(l => l.type === 'transport');
      if (cycle === 'secondary') assert.equal(transport.length, 0);
      else {
        assert.ok(transport.length > 0);
        assert.ok(transport.every(l => l.grossExpectedAmount === plan.monthlyGrossAmount));
        if (cycle === 'nursery') assert.ok(transport.every(l => l.period >= plan.effectivePeriod));
      }
    }
  }
  const studentId = students.primary18;
  for (const category of ['uniform', 'sports_uniform', 'books', 'supplies', 'exam', 'canteen', 'activity', 'excursion', 'event', 'photo', 'contribution', 'exceptional', 'other']) {
    const feeId = `fee-${category}-${suffix}`;
    const fee = { label: category, category, amount: 15000, description: 'Test', academicYear, mandatory: category !== 'excursion', dueDate: '2027-06-15', classIds: [], cycles: ['primary'], studentIds: [] };
    await assert.rejects(call('manageSchoolFee', { action: 'create', feeId, fee }, secretaryId), e => e.code === 'permission-denied');
    await call('manageSchoolFee', { action: 'create', feeId, fee });
    await call('manageSchoolFee', { action: 'create', feeId, fee });
    await assert.rejects(call('manageSchoolFee', { action: 'create', feeId, fee: { ...fee, amount: 1 } }), e => e.code === 'already-exists');
  }
  let account = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
  assert.equal(account.lines.filter(l => l.type === 'other').length, 12);
  const excursionId = `fee-excursion-${suffix}`;
  await call('manageSchoolFee', { action: 'assign', feeId: excursionId, studentId });
  await call('manageSchoolFee', { action: 'assign', feeId: excursionId, studentId });
  account = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
  assert.equal(account.lines.filter(l => l.type === 'other').length, 13);
  const transport = account.lines.find(l => l.type === 'transport');
  const feeId = `fee-uniform-${suffix}`;
  const allocations = [{ type: 'registration_fee', amount: 10000 }, { type: 'transport', period: transport.period, amount: 4000 }, { type: 'other', feeId, amount: 5000 }];
  const requestId = `allfees-pay-${suffix}`;
  const payment = await call('recordCashCollection', { studentId, academicYear, requestId, allocations }, secretaryId);
  assert.equal(payment.amount, 19000); assert.equal(payment.lineItems.length, 3);
  assert.equal((await call('recordCashCollection', { studentId, academicYear, requestId, allocations }, secretaryId)).idempotentReplay, true);
  account = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
  assert.equal(account.lines.find(l => l.feeId === feeId).remainingBalance, 10000);
  assert.equal(account.lines.find(l => l.key === transport.key).remainingBalance, 0);
  await call('recordCashCollection', { studentId, academicYear, requestId: `retained-${suffix}`,
    allocations: [{ type: 'tuition', installment: 'T3', amount: 1000 }] }, secretaryId);
  await call('setStudentTransportPlan', { studentId, usesTransport: true, zonePk: 36 });
  const changed = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
  assert.equal(changed.lines.find(l => l.key === transport.key).grossExpectedAmount, 4000, 'a paid historical period must not change tariff');
  assert.match(changed.lines.find(l => l.key === transport.key).label, /PK18/, 'the historical pickup point remains attached to its period');
  await seed('users', `allfees-foreign-${suffix}`, { schoolId: `foreign-${suffix}`, role: 'secretary', isActive: true });
  await assert.rejects(call('recordCashCollection', { studentId, academicYear, requestId, allocations }, `allfees-foreign-${suffix}`), e => e.code === 'permission-denied');
  await db.collection('schools').doc(schoolId).update({ 'transportPolicy.billingPeriods': ['2026-10', '2026-11'] });
  const preserved = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
  assert.equal(preserved.lines.find(l => l.key === transport.key).grossExpectedAmount, 4000, 'removing a calendar month cannot erase a historical obligation');
  await db.collection('schools').doc(schoolId).update({ 'transportPolicy.billingPeriods': ['2026-09', '2026-10', '2026-11'] });
  await call('manageSchoolFee', { action: 'archive', feeId });
  const archived = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
  assert.equal(archived.lines.find(l => l.feeId === feeId).remainingBalance, 10000, 'archiving preserves the debt');
  await assert.rejects(call('recordCashCollection', { studentId, academicYear, requestId: `overpay-${suffix}`, allocations: [{ type: 'other', feeId, amount: 10001 }] }, secretaryId));
  const reversal = await call('reverseCashCollection', { collectionId: payment.collectionId, requestId: `reverse-${suffix}`, reason: 'Emulator test' });
  const reversalSnapshot = await db.collection('payments').doc(reversal.reversalId).get();
  const financeBeforeTrigger = (await db.collection('studentFinance').doc(studentId).get()).data();
  assert.equal(financeBeforeTrigger.tuitionPaid, 1000);
  await api.updateStudentFinancialStatus.run({ before: { exists: false }, after: reversalSnapshot });
  const financeAfterTrigger = (await db.collection('studentFinance').doc(studentId).get()).data();
  assert.equal(financeAfterTrigger.tuitionPaid, 1000, 'the legacy trigger must not erase another V3 collection after reversal');
  assert.equal(financeAfterTrigger.transportPaid, 0);
  account = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
  assert.equal(account.lines.find(l => l.feeId === feeId).remainingBalance, 15000);
  assert.equal(account.lines.find(l => l.key === transport.key).remainingBalance, 4000);
  console.log('PASS all school fee categories, optional assignment, immutable rates, cycles, monthly transport, partial multi-fee receipt and reversal');
})().finally(async () => {
  for (const collection of ['studentFinancialObligations', 'studentFeeAssignments', 'studentTransportPlans', 'financialBenefits', 'paymentMoratoriums', 'payments', 'receipts', 'paymentAllocations', 'transportPaymentAllocations', 'audit_logs', 'cashLedgerDays', 'cashClosures']) {
    const snap = await db.collection(collection).where('schoolId', '==', schoolId).get();
    for (const doc of snap.docs) await doc.ref.delete();
  }
  await db.collection('counters').doc(`receipts_${schoolId}`).delete();
  for (const ref of documents.reverse()) await ref.delete();
}).catch(e => { console.error(e); process.exitCode = 1; });
