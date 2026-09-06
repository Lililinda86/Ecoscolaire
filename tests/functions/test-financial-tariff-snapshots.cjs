const assert = require('node:assert/strict');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required; live database refused');
const admin = require('../../functions/node_modules/firebase-admin');
const api = require('../../functions/lib/index');
const db = admin.firestore();
const schoolId = `snapshot-${Date.now()}-${process.pid}`;
const yearId = `${schoolId}-year`, classId = `${schoolId}-class`, director = `${schoolId}-director`, secretary = `${schoolId}-secretary`;
const year = '2026-2027';
const refs = [];
async function seed(collection, id, data) { const ref = db.collection(collection).doc(id); refs.push(ref); await ref.set({ schoolId, ...data }); }
const call = (name, data, uid = director) => api[name].run({ schoolId, ...data }, { auth: { uid } });
const account = studentId => call('getStudentFinancialAccount', { studentId, academicYear: year, monthlyTransport: true }, secretary);
const line = (a, key) => a.lines.find(l => l.key === key);
async function student(suffix) {
  const id = `${schoolId}-${suffix}`;
  await seed('students', id, { id, classId, academicYearId: yearId, academicYear: year, usesTransport: true, name: suffix });
  await seed('studentPrivate', id, { studentId: id, transportZonePk: 18 });
  await seed('studentFinance', id, { id, studentId: id, registrationFeeExpected: 15000 });
  return id;
}
(async () => {
  await seed('users', director, { role: 'director', active: true });
  await seed('users', secretary, { role: 'secretary', active: true });
  const configuration = { globalFees: { feeT1: 60000, feeT2: 50000, feeT3: 40000, feeTransport: 4000, feeUniforms: 10000 },
    classFees: { CP: { registration: 15000, tuition: 150000, t1: 60000, t2: 50000, t3: 40000 } },
    transportPolicy: { feePolicyId: 'ITALO_PK_2026', billingPeriods: ['2026-10', '2026-11'], pkRates: { pk14To33: 4000, pk34To42: 5000 } } };
  await seed('schools', schoolId, { name: 'Snapshot emulator', active: true, subscriptionStatus: 'active', academicYear: year, activeAcademicYearId: yearId, ...configuration });
  await seed('academicYears', yearId, { name: year, status: 'active', tuitionPaymentDeadlines: { T1: '2026-10-01', T2: '2027-01-01', T3: '2027-04-01' } });
  await seed('classes', classId, { name: 'CP', cycle: 'primary' });
  const first = await student('existing');
  const catalogId = `${schoolId}-uniform`;
  await call('manageSchoolFee', { action: 'create', feeId: catalogId, fee: { label: 'Tenue versionnée', category: 'uniform', description: 'Test', academicYear: year, amount: 10000, mandatory: true, classIds: [], cycles: [], studentIds: [], dueDate: null } });
  await call('setStudentTransportPlan', { studentId: first, usesTransport: true, zonePk: 18 });
  const before = await account(first);
  assert.equal(line(before, 'tuition:T1').grossExpectedAmount, 60000);
  assert.equal(line(before, 'transport:2026-10').grossExpectedAmount, 4000);
  assert.equal(line(before, 'uniforms').grossExpectedAmount, 10000);
  const paid = await call('recordCashCollection', { studentId: first, academicYear: year, requestId: `snapshot-payment-${schoolId}`, allocations: [{ type: 'tuition', installment: 'T3', amount: 1000 }] }, secretary);
  const paymentBefore = JSON.stringify((await db.collection('payments').doc(paid.paymentId).get()).data());
  const receiptBefore = JSON.stringify((await db.collection('receipts').doc(paid.receiptId).get()).data());
  const next = structuredClone(configuration);
  next.classFees.CP.t1 = 65000; next.classFees.CP.tuition = 155000;
  next.globalFees.feeUniforms = 12000;
  next.transportPolicy.pkRates.pk14To33 = 4500;
  next.transportPolicy.billingPeriods.push('2026-12');
  const request = { action: 'configure', expectedVersion: null, academicYear: year, reason: 'Emulator prospective revision', configuration: next };
  await assert.rejects(call('manageSchoolFee', request, secretary), e => e.code === 'permission-denied');
  const revision = await call('manageSchoolFee', request);
  assert.ok(revision.version);
  const after = await account(first);
  assert.equal(line(after, 'tuition:T1').grossExpectedAmount, 60000, 'existing unpaid future tuition is frozen');
  assert.equal(line(after, 'transport:2026-10').grossExpectedAmount, 4000);
  assert.equal(line(after, 'uniforms').grossExpectedAmount, 10000);
  await call('setStudentTransportPlan', { studentId: first, usesTransport: true, zonePk: 18 });
  assert.equal(line(await account(first), 'transport:2026-12').grossExpectedAmount, 4500, 'new month uses active rate');
  await call('setStudentTransportPlan', { studentId: first, usesTransport: true, zonePk: 36 });
  assert.equal(line(await account(first), 'transport:2026-10').grossExpectedAmount, 4000, 'PK change cannot reprice existing months');
  assert.match(line(await account(first), 'transport:2026-10').label, /PK18/);
  const second = await student('new');
  await call('manageSchoolFee', { action: 'revise', feeId: catalogId, expectedAmount: 10000, amount: 12000, reason: 'Revision test' });
  assert.equal(line(await account(first), `other:${catalogId}`).grossExpectedAmount, 10000);
  const newAccount = await account(second);
  assert.equal(line(newAccount, 'tuition:T1').grossExpectedAmount, 65000);
  assert.equal(line(newAccount, 'uniforms').grossExpectedAmount, 12000);
  assert.equal(line(newAccount, `other:${catalogId}`).grossExpectedAmount, 12000);
  await seed('classes', `${classId}-new`, { name: 'New class', cycle: 'primary' });
  await db.collection('students').doc(first).update({ classId: `${classId}-new` });
  assert.equal(line(await account(first), 'tuition:T1').grossExpectedAmount, 60000, 'class change preserves established tuition');
  await db.collection('academicYears').doc(yearId).update({ tuitionPaymentDeadlines: { T1: '2026-11-01', T2: '2027-02-01', T3: '2027-05-01' } });
  assert.equal(line(await account(first), 'tuition:T1').originalDueDate, '2026-10-01');
  assert.equal(JSON.stringify((await db.collection('payments').doc(paid.paymentId).get()).data()), paymentBefore);
  assert.equal(JSON.stringify((await db.collection('receipts').doc(paid.receiptId).get()).data()), receiptBefore);
  console.log('PASS immutable tuition, transport, uniforms, class/PK changes, new obligations, original dates, RBAC and historical receipts');
})().finally(async () => {
  for (const collection of ['studentFinancialObligations', 'studentTransportPlans', 'studentFeeAssignments', 'payments', 'receipts', 'paymentAllocations', 'transportPaymentAllocations', 'audit_logs', 'cashLedgerDays']) {
    for (const doc of (await db.collection(collection).where('schoolId', '==', schoolId).get()).docs) await doc.ref.delete();
  }
  for (const doc of (await db.collection('schools').doc(schoolId).collection('financialTariffVersions').get()).docs) await doc.ref.delete();
  await db.collection('counters').doc(`receipts_${schoolId}`).delete();
  for (const ref of refs.reverse()) await ref.delete();
}).catch(e => { console.error(e); process.exitCode = 1; });
