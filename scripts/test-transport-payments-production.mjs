import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateTransportRunnerConfig } from './transport-release-runner-contract.mjs';
import { applicationDefault, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { chromium } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { deleteDoc, doc, getDoc, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const REAL_ITALO_SCHOOL = 'italo-gsb';
export const assertTransportEnvironmentEvidence = ({ expectedProject, runtimeProjectId, networkProjectIds }) => {
  assert.ok(typeof expectedProject === 'string' && expectedProject.trim(), 'expectedProject is mandatory.');
  assert.ok(typeof runtimeProjectId === 'string' && runtimeProjectId.trim(), 'Authoritative runtime projectId is mandatory.');
  assert.equal(runtimeProjectId.trim(), expectedProject.trim(), 'Authoritative runtime project mismatch.');
  const observed = Array.isArray(networkProjectIds) ? networkProjectIds.filter(Boolean) : [];
  assert.ok(observed.every((projectId) => projectId === expectedProject), 'Network project ID mismatch.');
  return { expectedProject: expectedProject.trim(), runtimeProjectId: runtimeProjectId.trim(), networkProjectIds: observed };
};
const REQUIRED_FUNCTIONS = [
  'createStudentSecure', 'getCollectionQuote', 'recordCashPayment', 'reversePayment',
  'createFinancialBenefit', 'approveFinancialBenefit', 'closeCashDrawer',
];
const BASELINE_COLLECTIONS = [
  'students', 'classes', 'payments', 'receipts', 'financialBenefits', 'paymentDeadlines',
  'paymentMoratoriums', 'transportPaymentAllocations', 'cashClosures',
];
const FIXTURE_COLLECTIONS = [
  'payments', 'receipts', 'transportPaymentAllocations', 'financialBenefits',
  'financialBenefitReferences', 'paymentDeadlines', 'paymentMoratoriums', 'cashClosures',
  'audit_logs', 'students', 'studentPrivate', 'studentFinance', 'studentParentPrivate',
  'studentParentFinance', 'studentMatriculeReservations', 'studentDuplicateReservations',
  'classes', 'academicYears', 'users', 'schools',
];
const hashId = (prefix, values) => `${prefix}_${crypto.createHash('sha256')
  .update(JSON.stringify(values), 'utf8').digest('hex')}`;
const businessCode = (error) => error?.details?.businessCode || null;
const todayDouala = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const expectFailure = async (operation, codes = []) => {
  try {
    await operation();
    assert.fail(`Expected failure: ${codes.join(' or ')}`);
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    const actual = businessCode(error) || String(error?.code || '').replace(/^functions\//, '');
    assert.ok(codes.includes(actual), `Unexpected failure ${error?.code || 'unknown'} / ${businessCode(error) || 'none'}`);
  }
};


const snapshotInventory = async (db) => {
  const inventory = new Map();
  for (const name of BASELINE_COLLECTIONS) {
    const snapshot = await db.collection(name).get();
    const docs = new Map();
    for (const item of snapshot.docs) {
      const data = item.data();
      if (data.testFixture === true) continue;
      docs.set(item.id, {
        updateTime: item.updateTime?.toDate().toISOString() || null,
        version: data.version ?? null,
        status: data.status ?? null,
        type: data.type ?? data.paymentType ?? null,
        amount: Number.isSafeInteger(data.amount) ? data.amount : null,
        schoolId: data.schoolId || null,
        actor: data.updatedBy || data.createdBy || data.userId || data.closedBy || null,
      });
    }
    inventory.set(name, docs);
  }
  return inventory;
};

const compareInventory = (before, after, fixtureSchoolIds, fixtureUserIds) => {
  const releaseCaused = [];
  const concurrent = [];
  for (const name of BASELINE_COLLECTIONS) {
    const left = before.get(name) || new Map();
    const right = after.get(name) || new Map();
    const ids = new Set([...left.keys(), ...right.keys()]);
    for (const id of ids) {
      const a = left.get(id); const b = right.get(id);
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      const evidence = b || a || {};
      const change = { collection: name, id, schoolId: evidence.schoolId };
      if (fixtureSchoolIds.has(evidence.schoolId) || fixtureUserIds.has(evidence.actor)) releaseCaused.push(change);
      else concurrent.push(change);
    }
  }
  return { releaseCaused, concurrent };
};

const deleteRefs = async (db, refs) => {
  const unique = [...new Map(refs.filter(Boolean).map((ref) => [ref.path, ref])).values()];
  while (unique.length) {
    const batch = db.batch();
    unique.splice(0, 350).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

const main = async () => {
  const cfg = validateTransportRunnerConfig();
  const manifest = Object.fromEntries(FIXTURE_COLLECTIONS.map((name) => [name, new Set()]));
  manifest.authUsers = new Set();
  const otherSchoolId = `${cfg.fixtureSchoolId}-cross`.slice(0, 125);
  assert.notEqual(cfg.fixtureSchoolId, REAL_ITALO_SCHOOL);
  assert.notEqual(otherSchoolId, REAL_ITALO_SCHOOL);

  const adminApp = initializeAdminApp({
    credential: applicationDefault(), projectId: cfg.expectedProject,
  }, `transport-release-${cfg.testRunId}`);
  const db = getAdminFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const projectProbe = await db.collection('transportReleasePreflight').doc(cfg.testRunId).get();
  assert.equal(projectProbe.exists, false, 'Unexpected preflight marker collision.');
  assert.equal(adminApp.options.projectId, cfg.expectedProject, 'Admin runtime project mismatch.');
  assert.equal((await db.collection('schools').doc(cfg.fixtureSchoolId).get()).exists, false,
    'Exact fixture school already exists; refusing to reuse it.');
  await adminAuth.listUsers(1);
  console.log(`PREFLIGHT: PASS mode=${cfg.mode} runtime=${cfg.expectedProject} testRunId=${cfg.testRunId} firstWrite=NO`);
  console.log(`PREFLIGHT FUNCTIONS: ${REQUIRED_FUNCTIONS.join(',')}`);

  const baselineBefore = cfg.mode === 'production' ? await snapshotInventory(db) : null;
  const fixtureUserIds = new Set();
  const fixtureSchoolIds = new Set([cfg.fixtureSchoolId, otherSchoolId]);
  const clientApps = [];
  let browser;
  let browserContext;
  let page;
  let results = {};

  const mark = (collection, id) => { manifest[collection]?.add(id); return id; };
  const createMarked = async (collection, id, data) => {
    assert.notEqual(data.schoolId, REAL_ITALO_SCHOOL, `Forbidden real school mutation in ${collection}.`);
    await db.collection(collection).doc(id).create({
      ...data, testFixture: true, testRunId: cfg.testRunId,
    });
    mark(collection, id);
  };
  const passwordFor = (role) => `${crypto.randomBytes(24).toString('base64url')}!${role}A7`;
  const credentials = new Map();
  const createFixtureUser = async (role, schoolId = cfg.fixtureSchoolId) => {
    const credentialKey = role === 'owner' && schoolId === otherSchoolId ? 'crossOwner' : role;
    const email = `${credentialKey}-${cfg.testRunId}@example.invalid`.toLowerCase();
    const password = passwordFor(role);
    const account = await adminAuth.createUser({ email, password, displayName: `Transport ${role}` });
    fixtureUserIds.add(account.uid); manifest.authUsers.add(account.uid);
    await createMarked('users', account.uid, {
      uid: account.uid, email, name: `Transport ${role}`, role, schoolId, active: true, isActive: true,
    });
    credentials.set(credentialKey, { uid: account.uid, email, password, schoolId });
  };
  const newClient = async (key) => {
    const creds = credentials.get(key); assert.ok(creds, `Missing ${key} fixture credentials.`);
    const app = initializeApp(cfg.firebaseClientConfig,
      `transport-${key}-${cfg.testRunId}-${clientApps.length}`);
    clientApps.push(app);
    const auth = getAuth(app);
    await signInWithEmailAndPassword(auth, creds.email, creds.password);
    return { app, auth, firestore: getFirestore(app), functions: getFunctions(app, 'us-central1') };
  };

  try {
    const academicYear = '2025-2026';
    const periods = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01'];
    const yearId = mark('academicYears', `transport-year-${cfg.testRunId}`);
    const primaryClassId = mark('classes', `transport-primary-${cfg.testRunId}`);
    const secondaryClassId = mark('classes', `transport-secondary-${cfg.testRunId}`);
    await createMarked('schools', cfg.fixtureSchoolId, {
      id: cfg.fixtureSchoolId, name: `Transport release fixture ${cfg.testRunId}`, code: 'TR-FIX',
      academicYear, activeAcademicYearId: yearId, studentsCount: 0, active: true, isActive: true,
      paymentSettings: { activeProvider: 'none' },
      transportPolicy: { feePolicyId: 'ITALO_PK_2026', billingPeriods: periods },
      paymentDeadlines: { transport: {
        '2025-09': '2025-09-10', '2025-10': '2025-10-10', '2025-11': '2025-11-10',
        '2025-12': '2025-12-10', '2026-01': '2026-01-10',
      } },
    });
    await createMarked('schools', otherSchoolId, {
      id: otherSchoolId, name: `Cross tenant ${cfg.testRunId}`, code: 'TR-X', academicYear,
      studentsCount: 0, active: true, isActive: true,
      transportPolicy: { feePolicyId: 'ITALO_PK_2026', billingPeriods: periods },
    });
    await createMarked('academicYears', yearId, {
      id: yearId, schoolId: cfg.fixtureSchoolId, name: academicYear, status: 'active', active: true,
    });
    await createMarked('classes', primaryClassId, {
      id: primaryClassId, schoolId: cfg.fixtureSchoolId, name: 'CM1 Fixture', cycle: 'primary',
      section: 'francophone', isActive: true, academicYearId: yearId,
    });
    await createMarked('classes', secondaryClassId, {
      id: secondaryClassId, schoolId: cfg.fixtureSchoolId, name: '6e Fixture', cycle: 'secondary',
      section: 'francophone', isActive: true, academicYearId: yearId,
    });
    for (const role of ['owner', 'secretary', 'accountant', 'director']) await createFixtureUser(role);
    await createFixtureUser('owner', otherSchoolId);

    const owner = await newClient('owner');
    const secretary = await newClient('secretary');
    const accountant = await newClient('accountant');
    const director = await newClient('director');
    const crossOwner = await newClient('crossOwner');
    const call = (client, name, data) => httpsCallable(client.functions, name)(data).then((r) => r.data);
    const quote = (client, studentId, type = 'transport', extra = {}) => call(client, 'getCollectionQuote', {
      schoolId: cfg.fixtureSchoolId, studentId, academicYear, type, ...extra,
    });
    const pay = (client, studentId, requestId, amount, type = 'transport', extra = {}) => call(client, 'recordCashPayment', {
      schoolId: cfg.fixtureSchoolId, studentId, academicYear, requestId, amount, type, ...extra,
    });
    const reverse = (client, paymentId, requestId, reason) => call(client, 'reversePayment', {
      paymentId, requestId, reason,
    });
    const createStudent = async (label, zonePk, { classId = primaryClassId, usesTransport = true } = {}) => {
      const studentId = `transport-${label}-${cfg.testRunId}`.slice(0, 125);
      const matricule = `TR-${label}-${cfg.testRunId}`.slice(0, 80).toUpperCase();
      const created = await call(secretary, 'createStudentSecure', {
        studentId, requestedMatricule: matricule,
        studentData: { name: `Transport ${label}`, studentFirstName: label, studentLastName: 'Fixture',
          gender: 'F', section: 'francophone', classId, studentStatus: 'nouveau', usesTransport },
        privateData: { dob: '2017-01-02', parentName: 'Parent Fixture', parentPhone: '600000001',
          ...(zonePk === undefined ? {} : { transportZonePk: zonePk }) },
        financeData: { registrationFeeExpected: 15_000, feeT1: 70_000, feeT2: 70_000, feeT3: 70_000 },
        parentPrivateData: { dob: '2017-01-02' }, parentFinanceData: { feeT1: 70_000, feeT2: 70_000, feeT3: 70_000 },
      });
      assert.equal(created.studentId, studentId);
      for (const collection of ['students', 'studentPrivate', 'studentFinance', 'studentParentPrivate', 'studentParentFinance']) {
        await db.collection(collection).doc(studentId).update({ testFixture: true, testRunId: cfg.testRunId });
        mark(collection, studentId);
      }
      const student = (await db.collection('students').doc(studentId).get()).data();
      mark('studentMatriculeReservations', student.matriculeReservationId);
      mark('studentDuplicateReservations', student.duplicateReservationId);
      return studentId;
    };

    const pk14 = await createStudent('pk14', 14);
    const pk33 = await createStudent('pk33', 33);
    const pk34 = await createStudent('pk34', 34);
    const pk42 = await createStudent('pk42', 42);
    const secondary = await createStudent('secondary', 14, { classId: secondaryClassId });
    const invalid = await createStudent('invalid', undefined);
    const assertPaymentBalance = (payment, amount) => {
      const allocated = payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      assert.equal(allocated + (payment.transportCredit || 0), amount);
    };
    const amountMatrix = [
      [4000, 7000, await createStudent('pk14-7000', 14), [
        { kind: 'INSTALLMENT', period: periods[0], amount: 4_000 },
        { kind: 'INSTALLMENT', period: periods[1], amount: 3_000 },
      ]],
      [4000, 10000, await createStudent('pk14-10000', 14), [
        { kind: 'INSTALLMENT', period: periods[0], amount: 4_000 },
        { kind: 'INSTALLMENT', period: periods[1], amount: 4_000 },
        { kind: 'INSTALLMENT', period: periods[2], amount: 2_000 },
      ]],
      [4000, 15000, await createStudent('pk14-15000', 14), [
        { kind: 'INSTALLMENT', period: periods[0], amount: 4_000 },
        { kind: 'INSTALLMENT', period: periods[1], amount: 4_000 },
        { kind: 'INSTALLMENT', period: periods[2], amount: 4_000 },
        { kind: 'INSTALLMENT', period: periods[3], amount: 3_000 },
      ]],
      [4000, 20000, await createStudent('pk14-20000', 14), periods.map((period) => ({
        kind: 'INSTALLMENT', period, amount: 4_000,
      }))],
      [5000, 7000, await createStudent('pk34-7000', 34), [
        { kind: 'INSTALLMENT', period: periods[0], amount: 5_000 },
        { kind: 'INSTALLMENT', period: periods[1], amount: 2_000 },
      ]],
      [5000, 10000, await createStudent('pk34-10000', 34), [
        { kind: 'INSTALLMENT', period: periods[0], amount: 5_000 },
        { kind: 'INSTALLMENT', period: periods[1], amount: 5_000 },
      ]],
      [5000, 15000, await createStudent('pk34-15000', 34), periods.slice(0, 3).map((period) => ({
        kind: 'INSTALLMENT', period, amount: 5_000,
      }))],
      [5000, 20000, await createStudent('pk34-20000', 34), periods.slice(0, 4).map((period) => ({
        kind: 'INSTALLMENT', period, amount: 5_000,
      }))],
    ];
    for (const [tariff, amount, studentId, expectedAllocations] of amountMatrix) {
      const payment = await pay(secretary, studentId, `matrix-${tariff}-${amount}-${studentId}`, amount);
      assert.deepEqual(payment.allocations, expectedAllocations);
      assertPaymentBalance(payment, amount);
    }
    await db.collection('studentPrivate').doc(invalid).update({ transportZonePk: 13 });
    assert.deepEqual(await Promise.all([pk14, pk33, pk34, pk42].map(async (id) =>
      (await db.collection('studentPrivate').doc(id).get()).data().transportZonePk)), [14, 33, 34, 42]);

    const boundary = await Promise.all([pk14, pk33, pk34, pk42].map((id) => quote(secretary, id)));
    assert.deepEqual(boundary.map((q) => q.monthlyGrossAmount), [4_000, 4_000, 5_000, 5_000]);
    await expectFailure(() => quote(secretary, invalid), ['TRANSPORT_ZONE_OUTSIDE_POLICY']);
    const secondaryQuote = await quote(secretary, secondary);
    assert.deepEqual({ state: secondaryQuote.transportState, monthly: secondaryQuote.monthlyGrossAmount,
      remaining: secondaryQuote.remainingBalance }, { state: 'FREE_SECONDARY', monthly: 0, remaining: 0 });
    await expectFailure(() => pay(secretary, secondary, `secondary-deny-${cfg.testRunId}`, 1_000),
      ['TRANSPORT_FREE_SECONDARY']);

    const p4000 = await pay(secretary, pk14, `pk14-allocation-${cfg.testRunId}`, 10_000);
    assert.deepEqual(p4000.allocations, [
      { kind: 'INSTALLMENT', period: periods[0], amount: 4_000 },
      { kind: 'INSTALLMENT', period: periods[1], amount: 4_000 },
      { kind: 'INSTALLMENT', period: periods[2], amount: 2_000 },
    ]);
    const expectedP4000Remaining = periods.length * boundary[0].monthlyGrossAmount
      - (p4000.amount - (p4000.transportCredit || 0));
    assert.equal(p4000.remainingBalance, expectedP4000Remaining);
    const replay = await pay(secretary, pk14, `pk14-allocation-${cfg.testRunId}`, 10_000);
    assert.equal(replay.idempotentReplay, true);
    assert.equal((await db.collection('payments').where('requestId', '==', `pk14-allocation-${cfg.testRunId}`).get()).size, 1);
    assert.equal((await db.collection('receipts').where('requestId', '==', `pk14-allocation-${cfg.testRunId}`).get()).size, 1);
    const p5000 = await pay(secretary, pk34, `pk34-allocation-${cfg.testRunId}`, 10_000);
    assert.deepEqual(p5000.allocations, [
      { kind: 'INSTALLMENT', period: periods[0], amount: 5_000 },
      { kind: 'INSTALLMENT', period: periods[1], amount: 5_000 },
    ]);
    const partial = await pay(secretary, pk42, `pk42-partial-${cfg.testRunId}`, 2_000);
    assert.equal(partial.allocations[0].amount, 2_000);
    assert.equal((await quote(secretary, pk42)).installments[0].remainingBalance, 3_000);
    const expectedTransportCredit = 2_000;
    const creditPaymentAmount = 10_000;
    const remainingDebtBeforeCredit = creditPaymentAmount - expectedTransportCredit;
    const pk33GrossObligation = periods.length * boundary[1].monthlyGrossAmount;
    await pay(secretary, pk33, `pk33-prior-${cfg.testRunId}`,
      pk33GrossObligation - remainingDebtBeforeCredit);
    const credit = await pay(secretary, pk33, `pk33-credit-${cfg.testRunId}`, creditPaymentAmount);
    assert.deepEqual(credit.allocations, [
      ...periods.slice(-2).map((period) => ({
        kind: 'INSTALLMENT', period, amount: boundary[1].monthlyGrossAmount,
      })),
      { kind: 'CREDIT', period: null, amount: expectedTransportCredit },
    ]);
    assert.equal(credit.transportCredit, expectedTransportCredit);
    assert.equal((await quote(secretary, pk33, 'tuition', { installment: 'T1' })).previousPaid, 0);
    const creditReceipt = (await db.collection('receipts').doc(credit.receiptId).get()).data();
    assert.equal(creditReceipt.paymentType, 'transport');
    assert.equal(creditReceipt.amount, 10_000);
    assert.deepEqual(creditReceipt.allocationSummary, credit.allocations);
    assert.equal(creditReceipt.transportCredit, expectedTransportCredit);

    const benefitStudent = await createStudent('benefits', 34);
    const benefitDefs = [
      ['fixed-scholarship', 'SCHOLARSHIP', 'FIXED_AMOUNT', 1_000, periods[0], periods[0], true],
      ['percent-scholarship', 'SCHOLARSHIP', 'PERCENTAGE', 20, periods[1], periods[1], true],
      ['full-scholarship', 'SCHOLARSHIP', 'PERCENTAGE', 100, periods[2], periods[2], true],
      ['fixed-discount', 'EXCEPTIONAL_DISCOUNT', 'FIXED_AMOUNT', 500, periods[0], periods[0], true],
      ['percent-discount', 'EXCEPTIONAL_DISCOUNT', 'PERCENTAGE', 10, periods[1], periods[1], true],
      ['voucher', 'DISCOUNT_VOUCHER', 'FIXED_AMOUNT', 500, periods[0], periods[0], true],
      ['wrong-scope', 'SCHOLARSHIP', 'FIXED_AMOUNT', 2_000, null, null, true],
      ['expired', 'SCHOLARSHIP', 'FIXED_AMOUNT', 900, periods[0], periods[0], false],
    ];
    for (const [label, benefitType, mode, value, start, end, active] of benefitDefs) {
      const id = `transport-benefit-${label}-${cfg.testRunId}`.slice(0, 125);
      await createMarked('financialBenefits', id, {
        id, schoolId: cfg.fixtureSchoolId, studentId: benefitStudent, academicYear,
        requestId: id, benefitType, paymentType: label === 'wrong-scope' ? 'TUITION' : 'TRANSPORT',
        mode, value, ...(label === 'wrong-scope' ? { installment: 'T1' } : {
          transportStartPeriod: start, transportEndPeriod: end,
        }), status: active ? 'approved' : 'expired', reason: `Fixture ${label}`,
        stackable: true, usageCount: 0, maximumUses: label === 'voucher' ? 1 : 3,
        singleUse: label === 'voucher', appliedTargets: [], createdBy: credentials.get('owner').uid,
        approvedBy: credentials.get('owner').uid,
        ...(label === 'voucher' ? { reference: `VOUCHER-${cfg.testRunId}` } : {}),
      });
    }
    const benefitQuote = await quote(secretary, benefitStudent);
    assert.deepEqual(benefitQuote.installments.slice(0, 3).map((x) => [x.grossExpectedAmount, x.discountAmount, x.netExpectedAmount]), [
      [5_000, 2_000, 3_000], [5_000, 1_500, 3_500], [5_000, 5_000, 0],
    ]);
    assert.equal((await quote(secretary, benefitStudent, 'tuition', { installment: 'T1' })).discountAmount, 2_000);

    const approvalFixedStudent = await createStudent('benefit-approval-pk20', 20);
    const approvalFixed = await call(owner, 'createFinancialBenefit', {
      schoolId: cfg.fixtureSchoolId, studentId: approvalFixedStudent, academicYear,
      requestId: `approval-fixed-${cfg.testRunId}`, benefitType: 'SCHOLARSHIP', paymentType: 'TRANSPORT',
      mode: 'FIXED_AMOUNT', value: 1_000, transportStartPeriod: periods[0], transportEndPeriod: periods[0],
      stackable: true, reason: 'Fixture canonical PK20 fixed benefit', maximumUses: 1,
    });
    mark('financialBenefits', approvalFixed.benefitId);
    await call(owner, 'approveFinancialBenefit', { benefitId: approvalFixed.benefitId });
    const approvalFixedQuote = await quote(secretary, approvalFixedStudent);
    assert.deepEqual([
      approvalFixedQuote.installments[0].grossExpectedAmount,
      approvalFixedQuote.installments[0].discountAmount,
      approvalFixedQuote.installments[0].netExpectedAmount,
    ], [4_000, 1_000, 3_000]);

    const approvalPercentStudent = await createStudent('benefit-approval-pk34', 34);
    const approvalPercent = await call(owner, 'createFinancialBenefit', {
      schoolId: cfg.fixtureSchoolId, studentId: approvalPercentStudent, academicYear,
      requestId: `approval-percent-${cfg.testRunId}`, benefitType: 'SCHOLARSHIP', paymentType: 'TRANSPORT',
      mode: 'PERCENTAGE', value: 50, transportStartPeriod: periods[0], transportEndPeriod: periods[0],
      stackable: true, reason: 'Fixture canonical PK34 percentage benefit', maximumUses: 1,
    });
    mark('financialBenefits', approvalPercent.benefitId);
    await call(owner, 'approveFinancialBenefit', { benefitId: approvalPercent.benefitId });
    const approvalPercentQuote = await quote(secretary, approvalPercentStudent);
    assert.deepEqual([
      approvalPercentQuote.installments[0].grossExpectedAmount,
      approvalPercentQuote.installments[0].discountAmount,
      approvalPercentQuote.installments[0].netExpectedAmount,
    ], [5_000, 2_500, 2_500]);

    const expectTransportBenefitApprovalDenied = async (studentId, label, code) => {
      const created = await call(owner, 'createFinancialBenefit', {
        schoolId: cfg.fixtureSchoolId, studentId, academicYear,
        requestId: `approval-deny-${label}-${cfg.testRunId}`, benefitType: 'SCHOLARSHIP', paymentType: 'TRANSPORT',
        mode: 'FIXED_AMOUNT', value: 100, transportStartPeriod: periods[0], transportEndPeriod: periods[0],
        stackable: true, reason: `Fixture approval deny ${label}`, maximumUses: 1,
      });
      mark('financialBenefits', created.benefitId);
      await expectFailure(() => call(owner, 'approveFinancialBenefit', { benefitId: created.benefitId }), [code]);
    };
    await expectTransportBenefitApprovalDenied(secondary, 'secondary', 'TRANSPORT_FREE_SECONDARY');
    assert.equal((await quote(secretary, secondary)).remainingBalance, 0);
    const missingPkStudent = await createStudent('benefit-approval-missing-pk', undefined);
    await expectTransportBenefitApprovalDenied(missingPkStudent, 'missing-pk', 'TRANSPORT_ZONE_REQUIRED');
    await expectTransportBenefitApprovalDenied(invalid, 'outside-pk', 'TRANSPORT_ZONE_OUTSIDE_POLICY');

    const duplicateReference = `DUPLICATE-${cfg.testRunId}`;
    const firstDuplicate = await call(owner, 'createFinancialBenefit', {
      schoolId: cfg.fixtureSchoolId, studentId: benefitStudent, academicYear,
      requestId: `duplicate-benefit-a-${cfg.testRunId}`, benefitType: 'DISCOUNT_VOUCHER',
      paymentType: 'TRANSPORT', mode: 'FIXED_AMOUNT', value: 100,
      transportStartPeriod: periods[0], transportEndPeriod: periods[0], stackable: true,
      reason: 'Fixture duplicate voucher A', reference: duplicateReference, singleUse: true, maximumUses: 1,
    });
    mark('financialBenefits', firstDuplicate.benefitId);
    await call(owner, 'approveFinancialBenefit', { benefitId: firstDuplicate.benefitId });
    mark('financialBenefitReferences', hashId('benefitref', [cfg.fixtureSchoolId, duplicateReference]));
    const secondDuplicate = await call(owner, 'createFinancialBenefit', {
      schoolId: cfg.fixtureSchoolId, studentId: benefitStudent, academicYear,
      requestId: `duplicate-benefit-b-${cfg.testRunId}`, benefitType: 'DISCOUNT_VOUCHER',
      paymentType: 'TRANSPORT', mode: 'FIXED_AMOUNT', value: 100,
      transportStartPeriod: periods[0], transportEndPeriod: periods[0], stackable: true,
      reason: 'Fixture duplicate voucher B', reference: duplicateReference, singleUse: true, maximumUses: 1,
    });
    mark('financialBenefits', secondDuplicate.benefitId);
    await expectFailure(() => call(owner, 'approveFinancialBenefit', { benefitId: secondDuplicate.benefitId }),
      ['VOUCHER_REFERENCE_ALREADY_USED']);

    const moratoriumStudent = await createStudent('moratorium', 42);
    const futureMoratorium = `transport-moratorium-future-${cfg.testRunId}`.slice(0, 125);
    await createMarked('paymentMoratoriums', futureMoratorium, {
      id: futureMoratorium, schoolId: cfg.fixtureSchoolId, studentId: moratoriumStudent, academicYear,
      paymentType: 'transport', period: periods[0], status: 'approved',
      effectiveDueDate: '2027-12-31', reason: 'Fixture future moratorium',
    });
    const future = (await quote(secretary, moratoriumStudent)).installments[0];
    assert.deepEqual({ amount: future.grossExpectedAmount, original: future.originalDueDate,
      effective: future.effectiveDueDate, overdue: future.overdue },
    { amount: 5_000, original: '2025-09-10', effective: '2027-12-31', overdue: false });
    await db.collection('paymentMoratoriums').doc(futureMoratorium).update({ effectiveDueDate: '2026-01-01' });
    assert.equal((await quote(secretary, moratoriumStudent)).installments[0].overdue, true);
    const noDeadlineStudent = await createStudent('no-deadline', 20);
    await db.collection('schools').doc(cfg.fixtureSchoolId).update({
      'paymentDeadlines.transport.2025-11': FieldValue.delete(),
    });
    const noDeadline = (await quote(secretary, noDeadlineStudent)).installments.find((x) => x.period === periods[2]);
    assert.equal(noDeadline.overdue, false);

    const concurrentStudent = await createStudent('concurrent', 20);
    await Promise.all([
      pay(secretary, concurrentStudent, `concurrent-a-${cfg.testRunId}`, 4_000),
      pay(secretary, concurrentStudent, `concurrent-b-${cfg.testRunId}`, 4_000),
    ]);
    assert.deepEqual((await quote(secretary, concurrentStudent)).installments.map((x) => x.previousPaid), [4_000, 4_000, 0, 0, 0]);

    const reversalStudent = await createStudent('reversal', 14);
    const original = await pay(secretary, reversalStudent, `reversal-source-${cfg.testRunId}`, 10_000);
    const originalPayment = (await db.collection('payments').doc(original.paymentId).get()).data();
    const originalReceipt = (await db.collection('receipts').doc(original.receiptId).get()).data();
    await expectFailure(() => reverse(secretary, original.paymentId, `reverse-secretary-${cfg.testRunId}`, 'Refus secrétaire'),
      ['PERMISSION_DENIED']);
    const reversed = await reverse(owner, original.paymentId, `reverse-owner-${cfg.testRunId}`, 'Correction fixture');
    assert.equal(reversed.amount, -10_000);
    assert.deepEqual((await db.collection('payments').doc(original.paymentId).get()).data(), originalPayment);
    assert.deepEqual((await db.collection('receipts').doc(original.receiptId).get()).data(), originalReceipt);
    assert.deepEqual((await quote(secretary, reversalStudent)).installments.map((x) => x.previousPaid), periods.map(() => 0));
    const reversedAgain = await reverse(owner, original.paymentId, `reverse-owner-${cfg.testRunId}`, 'Correction fixture');
    assert.equal(reversedAgain.idempotentReplay, true);
    const raceStudent = await createStudent('reversal-race', 14);
    const racePayment = await pay(secretary, raceStudent, `race-source-${cfg.testRunId}`, 4_000);
    const race = await Promise.allSettled([
      reverse(owner, racePayment.paymentId, `race-reverse-a-${cfg.testRunId}`, 'Correction concurrente A'),
      reverse(owner, racePayment.paymentId, `race-reverse-b-${cfg.testRunId}`, 'Correction concurrente B'),
    ]);
    assert.equal(race.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal((await db.collection('payments').where('originalPaymentId', '==', racePayment.paymentId).get()).size, 1);

    const crossInput = { schoolId: cfg.fixtureSchoolId, studentId: pk42, academicYear,
      requestId: `cross-${cfg.testRunId}`, amount: 1_000, type: 'transport' };
    const rbacStudent = await createStudent('rbac', 20);
    const ownerRecord = await pay(owner, rbacStudent, `rbac-owner-${cfg.testRunId}`, 1_000);
    const accountantRecord = await pay(accountant, rbacStudent, `rbac-accountant-${cfg.testRunId}`, 1_000);
    assert.equal(ownerRecord.amount, 1_000);
    assert.equal(accountantRecord.amount, 1_000);
    assert.equal((await quote(secretary, rbacStudent)).installments[0].previousPaid, 2_000);

    await expectFailure(() => call(crossOwner, 'recordCashPayment', crossInput), ['CROSS_SCHOOL_DENIED']);
    for (const client of [owner, secretary, accountant, director]) {
      assert.equal((await getDoc(doc(client.firestore, 'payments', p4000.paymentId))).exists(), true);
    }
    const directTargets = [
      ['payments', p4000.paymentId], ['receipts', p4000.receiptId],
      ['transportPaymentAllocations', (await db.collection('transportPaymentAllocations')
        .where('paymentId', '==', p4000.paymentId).limit(1).get()).docs[0].id],
    ];
    for (const [collection, id] of directTargets) {
      const directId = `direct-${cfg.testRunId}`;
      mark(collection, directId);
      await expectFailure(() => setDoc(doc(secretary.firestore, collection, directId),
        { schoolId: cfg.fixtureSchoolId, testFixture: true, testRunId: cfg.testRunId }), ['permission-denied']);
      await expectFailure(() => updateDoc(doc(secretary.firestore, collection, id), { amount: 1 }), ['permission-denied']);
      await expectFailure(() => deleteDoc(doc(secretary.firestore, collection, id)), ['permission-denied']);
    }

    const tuitionStudent = await createStudent('tuition-cash', 20);
    const tuitionBefore = await quote(secretary, tuitionStudent, 'tuition', { installment: 'T1' });
    await pay(secretary, tuitionStudent, `tuition-cash-${cfg.testRunId}`, 5_000, 'tuition', { installment: 'T1' });
    assert.equal((await quote(secretary, tuitionStudent)).previousPaid, 0);
    assert.equal((await quote(secretary, benefitStudent, 'tuition', { installment: 'T2' })).discountAmount, 0);
    assert.equal(tuitionBefore.grossExpectedAmount, 70_000);
    const today = todayDouala();
    const paymentsToday = await db.collection('payments').where('schoolId', '==', cfg.fixtureSchoolId)
      .where('date', '==', today).get();
    const expectedCash = paymentsToday.docs.reduce((sum, item) => {
      const d = item.data(); return sum + (d.method === 'cash' && d.status === 'completed' ? d.amount : 0);
    }, 0);
    const closure = await call(secretary, 'closeCashDrawer', {
      schoolId: cfg.fixtureSchoolId, academicYear, date: today,
      openingBalance: 0, countedBalance: expectedCash, notes: `Transport fixture ${cfg.testRunId}`,
    });
    mark('cashClosures', closure.closureId);
    const closureData = (await db.collection('cashClosures').doc(closure.closureId).get()).data();
    assert.equal(closureData.theoreticalBalance, closureData.countedBalance);

    browser = await chromium.launch({ headless: true });
    browserContext = await browser.newContext();
    page = await browserContext.newPage();
    if (cfg.mode === 'staging') {
      await page.route(`${cfg.appUrl}/**`, (route) => route.continue({ headers: {
        ...route.request().headers(), 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        'x-vercel-set-bypass-cookie': 'true',
      } }));
    }
    const firebaseProjects = new Set();
    page.on('request', (request) => {
      const match = request.url().match(/projects\/([^/]+)\/databases/);
      if (match) firebaseProjects.add(decodeURIComponent(match[1]));
    });
    await page.goto(`${cfg.appUrl}/#/diagnostic`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const runtimeProject = (await page.getByTestId('diagnostic-firebase-project').textContent())?.trim();
    assertTransportEnvironmentEvidence({ expectedProject: cfg.expectedProject, runtimeProjectId: runtimeProject,
      networkProjectIds: [...firebaseProjects] });
    await page.goto(`${cfg.appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email').fill(credentials.get('owner').email);
    await page.getByTestId('login-password').fill(credentials.get('owner').password);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 30_000 });
    const widths = [360, 768, 1440];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${cfg.appUrl}/#/payments`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Comptabilité Générale/i }).waitFor({ timeout: 30_000 });
      await page.getByRole('button', { name: /Encaissement/i }).first().click();
      await page.getByTestId('cash-payment-student').selectOption(benefitStudent);
      await page.getByTestId('cash-payment-type').selectOption('transport');
      await page.getByTestId('transport-auto-allocation').waitFor({ state: 'visible' });
      await page.getByText(/Zone PK34/).waitFor({ state: 'visible' });
      await page.getByText(/Mensualité brute/).waitFor({ state: 'visible' });
      await page.getByText(/Bourse \/ réduction applicable/).waitFor({ state: 'visible' });
      await page.getByText(/Moratoire/).waitFor({ state: 'visible' });
      await page.getByTestId('cash-payment-student').selectOption(secondary);
      await page.getByTestId('transport-free-secondary').waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('cash-payment-submit').isDisabled(), true);
      await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    }
    assertTransportEnvironmentEvidence({ expectedProject: cfg.expectedProject, runtimeProjectId: runtimeProject,
      networkProjectIds: [...firebaseProjects] });
    results = {
      pk14: 4_000, pk33: 4_000, pk34: 5_000, pk42: 5_000, secondary: 'FREE',
      allocation4000: p4000.allocations, allocation5000: p5000.allocations,
      partialRemaining: 3_000, credit: 2_000, benefits: 'PASS', moratorium: 'PASS',
      idempotence: 'PASS', concurrency: 'PASS', reversal: 'PASS', cashClosure: expectedCash,
      tuitionIsolation: 'PASS', rbac: 'PASS', directWrites: 'DENY', responsive: widths,
    };
    console.log(`TRANSPORT RELEASE CONTRACT: PASS ${JSON.stringify(results)}`);
  } finally {
    console.log(`CLEANUP: exact testRunId=${cfg.testRunId} and manifest IDs only`);
    if (page) await page.close().catch(() => undefined);
    if (browserContext) await browserContext.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    for (const app of clientApps) {
      const auth = getAuth(app); if (auth.currentUser) await signOut(auth).catch(() => undefined);
      await deleteApp(app).catch(() => undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    for (let round = 0; round < 2; round += 1) {
      const refs = [];
      for (const collection of FIXTURE_COLLECTIONS) {
        const byRun = await db.collection(collection).where('testRunId', '==', cfg.testRunId).get();
        refs.push(...byRun.docs.map((item) => item.ref));
        if (['audit_logs', 'cashClosures'].includes(collection)) {
          for (const schoolId of fixtureSchoolIds) {
            const bySchool = await db.collection(collection).where('schoolId', '==', schoolId).get();
            refs.push(...bySchool.docs.map((item) => item.ref));
          }
        }
        for (const id of manifest[collection] || []) refs.push(db.collection(collection).doc(id));
      }
      refs.push(db.collection('counters').doc(`receipts_${cfg.fixtureSchoolId}`));
      refs.push(db.collection('counters').doc(`receipts_${otherSchoolId}`));
      await deleteRefs(db, refs);
      for (const uid of manifest.authUsers) await adminAuth.deleteUser(uid).catch((error) => {
        if (error?.code !== 'auth/user-not-found') throw error;
      });
      if (round === 0) await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    const residuals = {};
    for (const collection of FIXTURE_COLLECTIONS) {
      const byRun = await db.collection(collection).where('testRunId', '==', cfg.testRunId).get();
      let count = byRun.size;
      for (const schoolId of fixtureSchoolIds) {
        const bySchool = await db.collection(collection).where('schoolId', '==', schoolId).get();
        count += bySchool.docs.filter((item) => item.data().testRunId !== cfg.testRunId).length;
      }
      residuals[collection] = count;
    }
    residuals.authUsers = 0;
    for (const uid of manifest.authUsers) {
      try { await adminAuth.getUser(uid); residuals.authUsers += 1; } catch (error) {
        if (error?.code !== 'auth/user-not-found') throw error;
      }
    }
    residuals.counters = (await Promise.all([...fixtureSchoolIds].map((schoolId) =>
      db.collection('counters').doc(`receipts_${schoolId}`).get()))).filter((x) => x.exists).length;
    const orphanCount = Object.values(residuals).reduce((sum, value) => sum + value, 0);
    assert.equal(orphanCount, 0, `Fixture cleanup residuals: ${JSON.stringify(residuals)}`);
    console.log(`TRANSPORT FIXTURE CLEANUP: PASS testRunId=${cfg.testRunId} residuals=0 orphans=0`);
    if (baselineBefore) {
      const baselineAfter = await snapshotInventory(db);
      const safety = compareInventory(baselineBefore, baselineAfter, fixtureSchoolIds, fixtureUserIds);
      assert.deepEqual(safety.releaseCaused, [], `Release-caused real-data changes: ${JSON.stringify(safety.releaseCaused)}`);
      console.log(`REAL DATA SAFETY: PASS releaseCaused=0 concurrentRealUserActivity=${safety.concurrent.length}`);
    }
    await deleteAdminApp(adminApp);
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`TRANSPORT RELEASE RUNNER: FAIL ${error?.code || 'UNKNOWN'} ${error?.message || error}`);
    process.exitCode = 1;
  });
}
