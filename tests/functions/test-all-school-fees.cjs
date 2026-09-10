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
      const plan = await call('setStudentTransportPlan', { studentId, usesTransport: true });
      assert.equal((await db.collection('studentPrivate').doc(studentId).get()).data().transportZonePk, pk, 'stored PK reused without re-entry');
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
  const { appliesToStudent } = require('../../functions/lib/schoolFeeCatalog');
  const unrestrictedFee = { academicYear, active: true, cycles: [], classIds: [], studentIds: [] };
  assert.equal(appliesToStudent(unrestrictedFee, { id: studentId, classId: 'primary', academicYearId: yearId }, { cycle: 'primary', academicYearId: yearId }, academicYear), true);
  assert.equal(appliesToStudent(unrestrictedFee, { id: studentId, classId: 'primary', academicYearId: yearId }, { cycle: 'primary', academicYearId: 'old-year' }, academicYear), false);
  assert.equal(appliesToStudent({ ...unrestrictedFee, cycles: ['nursery'] }, { id: studentId, classId: 'primary' }, { cycle: 'primary' }, academicYear), false);
  for (const category of ['uniform', 'sports_uniform', 'books', 'supplies', 'exam', 'canteen', 'childcare', 'activity', 'excursion', 'event', 'photo', 'contribution', 'exceptional', 'other']) {
    const feeId = `fee-${category}-${suffix}`;
    const fee = { label: category, category, amount: 15000, description: 'Test', academicYear, mandatory: category !== 'excursion', dueDate: '2027-06-15', classIds: [], cycles: ['primary'], studentIds: [] };
    await assert.rejects(call('manageSchoolFee', { action: 'create', feeId, fee }, secretaryId), e => e.code === 'permission-denied');
    await call('manageSchoolFee', { action: 'create', feeId, fee });
    // Publication persists the debt before any account read, with no out-of-scope debt.
    const immediately = await db.collection('studentFinancialObligations').where('feeId', '==', feeId).get();
    assert.equal(immediately.size, fee.mandatory ? 2 : 0);
    assert.ok(immediately.docs.every(d => [students.primary18, students.primary36].includes(d.data().studentId)));
    const replay = await call('manageSchoolFee', { action: 'create', feeId, fee });
    assert.equal(replay.replay, true, 'idempotent retry ignores Firestore object key order');
    assert.equal((await db.collection('studentFinancialObligations').where('feeId', '==', feeId).get()).size, immediately.size);

    await call('manageSchoolFee', { action: 'create', feeId, fee });
    await assert.rejects(call('manageSchoolFee', { action: 'create', feeId, fee: { ...fee, amount: 1 } }), e => e.code === 'already-exists');
  }
  const scopeFee = { label: 'Scope test', category: 'other', amount: 7500, description: '', academicYear, mandatory: false, dueDate: null, cycles: ['nursery'], classIds: [`allfees-class-primary-${suffix}`], studentIds: [] };
  await assert.rejects(call('manageSchoolFee', { action: 'create', feeId: `bad-cycle-${suffix}`, fee: scopeFee }), e => e.code === 'failed-precondition');
  await assert.rejects(call('manageSchoolFee', { action: 'create', feeId: `bad-student-${suffix}`, fee: { ...scopeFee, cycles: ['primary'], studentIds: [students.nursery18] } }), e => e.code === 'failed-precondition');
  await db.collection('students').doc(students.primary36).update({ schoolingStatus: 'inactive' });
  await assert.rejects(call('manageSchoolFee', { action: 'create', feeId: `inactive-${suffix}`, fee: { ...scopeFee, cycles: ['primary'], studentIds: [students.primary36] } }), e => e.code === 'failed-precondition');
  await db.collection('students').doc(students.primary36).update({ schoolingStatus: 'active' });
  await db.collection('classes').doc(`allfees-class-primary-${suffix}`).update({ isActive: false });
  await assert.rejects(call('manageSchoolFee', { action: 'create', feeId: `inactive-class-${suffix}`, fee: { ...scopeFee, cycles: ['primary'] } }), e => e.code === 'failed-precondition');
  await db.collection('classes').doc(`allfees-class-primary-${suffix}`).update({ isActive: true });
  const legacySchool = (await db.collection('schools').doc(schoolId).get()).data();
  await db.collection('schools').doc(schoolId).update({ feeCatalog: [...legacySchool.feeCatalog,
    { id: 'legacy-edit', label: 'Legacy edit', amount: 2500, cycles: ['secondary'] },
    { id: 'legacy-archive', label: 'Legacy archive', amount: 3000, cycles: ['nursery'] }] });
  await call('manageSchoolFee', { action: 'revise', feeId: 'legacy-edit', expectedAmount: 2500, expectedVersion: null, reason: 'Legacy preservation',
    fee: { label: 'New legacy version', amount: 4500, description: '', category: 'other', academicYear, mandatory: true, cycles: ['primary'], classIds: [], studentIds: [] } });
  const preservedLegacy = (await call('getStudentFinancialAccount', { studentId: students.secondary18, academicYear }, secretaryId)).lines.find(l => l.feeId === 'legacy-edit');
  assert.equal(preservedLegacy.grossExpectedAmount, 2500); assert.equal(preservedLegacy.label, 'Legacy edit');
  await call('manageSchoolFee', { action: 'archive', feeId: 'legacy-edit' });
  await call('manageSchoolFee', { action: 'archive', feeId: 'legacy-archive' });
  const archivedLegacy = (await call('getStudentFinancialAccount', { studentId: students.nursery18, academicYear }, secretaryId)).lines.find(l => l.feeId === 'legacy-archive');
  assert.equal(archivedLegacy.grossExpectedAmount, 3000);
  // Legacy upgrade's new primary obligations are isolated from the base fixture's line-count checks.
  for (const collection of ['studentFeeAssignments', 'studentFinancialObligations']) {
    const docs = await db.collection(collection).where('schoolId', '==', schoolId).get();
    for (const doc of docs.docs) if (doc.data().feeId === 'legacy-edit' && [students.primary18, students.primary36].includes(doc.data().studentId)) await doc.ref.delete();
  }
  // Complete edits preserve established terms, reject stale updates, and do not write a payment.
  const editId = `full-edit-${suffix}`;
  const initialFee = { ...scopeFee, label: 'Initial label', cycles: ['primary'], mandatory: true, studentIds: [studentId] };
  await call('manageSchoolFee', { action: 'create', feeId: editId, fee: initialFee });
  const initialAccount = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
  const initialLine = initialAccount.lines.find(l => l.feeId === editId);
  const paymentsBefore = (await db.collection('payments').where('schoolId', '==', schoolId).get()).size;
  const editedFee = { ...initialFee, label: 'Revised label', description: 'Revised description', category: 'books', dueDate: '2027-06-20', amount: 9000, studentIds: [students.primary36] };
  const editPayload = { action: 'revise', feeId: editId, fee: editedFee, expectedAmount: 7500, expectedVersion: null, reason: 'Complete edit test' };
  await assert.rejects(call('manageSchoolFee', editPayload, secretaryId), e => e.code === 'permission-denied');
  await call('manageSchoolFee', editPayload);
  await assert.rejects(call('manageSchoolFee', editPayload), e => e.code === 'failed-precondition');
  const oldLine = (await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId)).lines.find(l => l.feeId === editId);
  assert.equal(oldLine.label, initialLine.label); assert.equal(oldLine.grossExpectedAmount, 7500); assert.equal(oldLine.originalDueDate, null);
  const newLine = (await call('getStudentFinancialAccount', { studentId: students.primary36, academicYear, monthlyTransport: true }, secretaryId)).lines.find(l => l.feeId === editId);
  assert.equal(newLine.label, 'Revised label'); assert.equal(newLine.grossExpectedAmount, 9000); assert.equal(newLine.originalDueDate, '2027-06-20');
  assert.equal((await db.collection('payments').where('schoolId', '==', schoolId).get()).size, paymentsBefore);
  await call('manageSchoolFee', { action: 'archive', feeId: editId });
  // Remove only this test catalogue/assignment/snapshot to preserve pre-existing exact line-count assertions below.
  const editSchool = (await db.collection('schools').doc(schoolId).get()).data();
  await db.collection('schools').doc(schoolId).update({ feeCatalog: editSchool.feeCatalog.filter(f => f.id !== editId) });
  for (const collection of ['studentFeeAssignments', 'studentFinancialObligations']) {
    const docs = await db.collection(collection).where('schoolId', '==', schoolId).get();
    for (const doc of docs.docs) if (doc.data().feeId === editId) await doc.ref.delete();
  }
  let account = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
  assert.equal(account.lines.filter(l => l.type === 'other').length, 13);
  assert.deepEqual(account.groups.find(g => g.key === 'one-off').lineKeys.sort(), [`other:fee-exam-${suffix}`, `other:fee-exceptional-${suffix}`].sort());
  assert.equal(account.groups.find(g => g.key === 'one-off').totals.totalBilled, 30000);
  assert.ok(account.groups.find(g => g.key === 'other').lineKeys.includes(`other:fee-photo-${suffix}`));
  const excursionId = `fee-excursion-${suffix}`;
  await call('manageSchoolFee', { action: 'assign', feeId: excursionId, studentId });
  await call('manageSchoolFee', { action: 'assign', feeId: excursionId, studentId });
  account = await call('getStudentFinancialAccount', { studentId, academicYear, monthlyTransport: true }, secretaryId);
  assert.equal(account.lines.filter(l => l.type === 'other').length, 14);
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
  for (const version of (await db.collection('schools').doc(schoolId).collection('financialTariffVersions').get()).docs) await version.ref.delete();
  for (const ref of documents.reverse()) await ref.delete();
}).catch(e => { console.error(e); process.exitCode = 1; });
