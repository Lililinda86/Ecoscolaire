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
import { deleteDoc, doc, getDoc, getFirestore, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  PRODUCTION_LOTS123_ACADEMIC_YEAR,
  PRODUCTION_LOTS123_TUITION_DEADLINES,
  PRODUCTION_LOTS123_TUITION_MORATORIUM,
  PRODUCTION_LOTS123_TUITION_QUOTE,
  assertProductionTuitionMoratoriumFixture,
} from './test-payment-lots123-production.mjs';

const REAL_ITALO_SCHOOL = 'italo-gsb';
const STUDENT_PRIVATE_TRANSPORT_AUDIT_INPUT_KEYS = new Set([
  'transportZonePk', 'transportNeighborhood', 'transportPickupPoint',
  'updatedAt', 'updatedBy', 'secretaryFixtureUid',
]);
export const buildStudentPrivateTransportAuditUpdate = (input) => {
  assert.ok(input && typeof input === 'object' && !Array.isArray(input), 'studentPrivate audit input is required.');
  assert.ok(Object.keys(input).every((key) => STUDENT_PRIVATE_TRANSPORT_AUDIT_INPUT_KEYS.has(key)),
    'studentPrivate transport update contains a forbidden field.');
  assert.ok(input.updatedAt !== undefined && input.updatedAt !== null, 'updatedAt is required.');
  assert.ok(typeof input.secretaryFixtureUid === 'string' && input.secretaryFixtureUid.length > 0,
    'secretary fixture UID is required.');
  assert.equal(input.updatedBy, input.secretaryFixtureUid, 'updatedBy must be the secretary fixture UID.');
  return {
    transportZonePk: input.transportZonePk,
    transportNeighborhood: input.transportNeighborhood,
    transportPickupPoint: input.transportPickupPoint,
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
  };
};
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
  'schools', 'students', 'studentFinance', 'classes', 'payments', 'receipts', 'financialBenefits', 'paymentDeadlines',
  'paymentMoratoriums', 'transportPaymentAllocations', 'cashClosures',
];
const FIXTURE_COLLECTIONS = [
  'payments', 'transportPaymentAllocations', 'receipts', 'financialBenefits',
  'financialBenefitReferences', 'paymentDeadlines', 'paymentMoratoriums', 'cashClosures',
  'audit_logs', 'students', 'studentPrivate', 'studentFinance', 'studentParentPrivate',
  'studentParentFinance', 'studentMatriculeReservations', 'studentDuplicateReservations',
  'classes', 'academicYears', 'users', 'schools', 'cashLedgerDays',
];
const hashId = (prefix, values) => `${prefix}_${crypto.createHash('sha256')
  .update(JSON.stringify(values), 'utf8').digest('hex')}`;
const businessCode = (error) => error?.details?.businessCode || null;
const todayDouala = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const SECRET_KEY = /(?:authorization|cookie|credential|password|private.?key|secret|token)/i;
const SECRET_TEXT_PATTERNS = [
  [/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, '[REDACTED_PRIVATE_KEY]'],
  [/(\bBearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, '$1[REDACTED]'],
  [/((?:authorization|cookie|credential|password|secret|token)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
    '$1[REDACTED]'],
];

export const redactDiagnosticText = (value) => SECRET_TEXT_PATTERNS.reduce(
  (text, [pattern, replacement]) => text.replace(pattern, replacement), String(value ?? ''),
);

const sanitizeDiagnosticValue = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return redactDiagnosticText(value);
  if (typeof value !== 'object') return redactDiagnosticText(String(value));
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeDiagnosticValue(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SECRET_KEY.test(key) ? '[REDACTED]' : sanitizeDiagnosticValue(item, seen),
  ]));
};

export const safeErrorSnapshot = (error) => {
  if (error === null || error === undefined) {
    return { name: String(error), message: String(error), code: null, details: null, businessCode: null,
      cause: null, stack: null };
  }
  if (typeof error !== 'object') {
    return { name: typeof error, message: redactDiagnosticText(error), code: null, details: null,
      businessCode: null, cause: null, stack: null };
  }
  return {
    name: redactDiagnosticText(error.name || error.constructor?.name || 'Error'),
    message: redactDiagnosticText(error.message || String(error)),
    code: error.code === undefined ? null : redactDiagnosticText(error.code),
    details: sanitizeDiagnosticValue(error.details ?? null),
    businessCode: businessCode(error),
    cause: error.cause === undefined ? null : sanitizeDiagnosticValue(
      error.cause instanceof Error ? {
        name: error.cause.name, message: error.cause.message, code: error.cause.code, stack: error.cause.stack,
      } : error.cause,
    ),
    stack: error.stack ? redactDiagnosticText(error.stack) : null,
  };
};

const validateExpectedFailureContext = (context) => {
  assert.ok(context && typeof context === 'object', 'Expected-failure context is required.');
  assert.match(context.scenarioId || '', /^LOT[123]_[A-Z0-9_]+$/, 'A stable scenarioId is required.');
  assert.ok([1, 2, 3].includes(context.lot), 'Lot must be 1, 2 or 3.');
  assert.ok(typeof context.operation === 'string' && context.operation.trim(), 'Operation is required.');
  assert.ok(Array.isArray(context.expectedCodes) && context.expectedCodes.length > 0,
    'At least one expected code is required.');
};

export const createExpectedFailureDiagnostic = (context, originalError, normalizedCode = '') => {
  validateExpectedFailureContext(context);
  const original = safeErrorSnapshot(originalError);
  const metadata = sanitizeDiagnosticValue(context.metadata || {});
  const lines = [
    'EXPECT_FAILURE_MISMATCH',
    `scenarioId=${context.scenarioId}`,
    `lot=${context.lot}`,
    `operation=${redactDiagnosticText(context.operation)}`,
    `expectedCodes=${context.expectedCodes.join(',')}`,
    `normalizedCode=${normalizedCode || '<empty>'}`,
    `errorName=${original.name}`,
    `errorCode=${original.code ?? '<empty>'}`,
    `businessCode=${original.businessCode ?? '<empty>'}`,
    `errorMessage=${original.message}`,
    `details=${JSON.stringify(original.details)}`,
    `cause=${JSON.stringify(original.cause)}`,
    `metadata=${JSON.stringify(metadata)}`,
    `originalStack=${original.stack || '<none>'}`,
  ];
  const options = originalError instanceof Error ? { cause: originalError } : undefined;
  const diagnostic = new Error(lines.join('\n'), options);
  diagnostic.name = 'ExpectedFailureDiagnosticError';
  diagnostic.code = 'EXPECT_FAILURE_MISMATCH';
  diagnostic.scenarioId = context.scenarioId;
  diagnostic.lot = context.lot;
  diagnostic.operation = context.operation;
  diagnostic.expectedCodes = [...context.expectedCodes];
  diagnostic.normalizedCode = normalizedCode;
  diagnostic.originalError = original;
  diagnostic.metadata = metadata;
  return diagnostic;
};

export const expectFailure = async (context, operation) => {
  validateExpectedFailureContext(context);
  let didThrow = false;
  let originalError;
  try {
    await operation();
  } catch (error) {
    didThrow = true;
    originalError = error;
  }
  if (!didThrow) {
    originalError = new Error('Operation completed successfully although failure was required.');
  }
  const normalizedCode = businessCode(originalError)
    || String(originalError?.code || '').replace(/^functions\//, '');
  if (context.expectedCodes.includes(normalizedCode)) return originalError;
  throw createExpectedFailureDiagnostic(context, originalError, normalizedCode);
};

export const paymentFailureMarker = (error) => ({
  scenarioId: error?.scenarioId || 'UNSCOPED_FAILURE',
  lot: error?.lot ?? null,
  operation: redactDiagnosticText(error?.operation || 'unknown'),
  errorName: redactDiagnosticText(error?.name || 'Error'),
  errorCode: redactDiagnosticText(error?.code || ''),
  businessCode: redactDiagnosticText(error?.originalError?.businessCode || businessCode(error) || ''),
  message: redactDiagnosticText(error?.message || String(error)),
});

const checkpoint = (marker) => console.log(`PAYMENT_LOTS123_CHECKPOINT ${marker}`);


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
    const academicYear = PRODUCTION_LOTS123_ACADEMIC_YEAR;
    const tuitionMoratoriumFixture = { ...PRODUCTION_LOTS123_TUITION_MORATORIUM };
    const academicYearFixture = {
      name: academicYear,
      tuitionPaymentDeadlines: { ...PRODUCTION_LOTS123_TUITION_DEADLINES },
    };
    assertProductionTuitionMoratoriumFixture({
      academicYear: academicYearFixture,
      moratorium: tuitionMoratoriumFixture,
    });
    const periods = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01'];
    const yearId = mark('academicYears', `transport-year-${cfg.testRunId}`);
    const primaryClassId = mark('classes', `transport-primary-${cfg.testRunId}`);
    const secondaryClassId = mark('classes', `transport-secondary-${cfg.testRunId}`);
    const class120Id = cfg.isPaymentLots123 ? mark('classes', `lots123-120-${cfg.testRunId}`) : null;
    const class2Id = cfg.isPaymentLots123 ? mark('classes', `lots123-2-${cfg.testRunId}`) : null;
    await createMarked('schools', cfg.fixtureSchoolId, {
      id: cfg.fixtureSchoolId, name: `Transport release fixture ${cfg.testRunId}`, code: 'TR-FIX',
      academicYear, activeAcademicYearId: yearId, studentsCount: 0, active: true, isActive: true,
      paymentSettings: { activeProvider: 'none' },
      ...(cfg.isPaymentLots123 ? { classFees: {
        'LOT123 Class 85K': { annual: 85_000, t1: 40_000, t2: 30_000, t3: 15_000 },
        'LOT123 Class 120K': { annual: 120_000, t1: 60_000, t2: 40_000, t3: 20_000 },
        'LOT123 Class 2 installments': { annual: 85_000, t1: 50_000, t2: 35_000, t3: 0 },
      } } : {}),
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
      id: yearId, schoolId: cfg.fixtureSchoolId, ...academicYearFixture, status: 'active', active: true,
    });
    await createMarked('classes', primaryClassId, {
      id: primaryClassId, schoolId: cfg.fixtureSchoolId,
      name: cfg.isPaymentLots123 ? 'LOT123 Class 85K' : 'CM1 Fixture', cycle: 'primary',
      section: 'francophone', isActive: true, academicYearId: yearId,
    });
    await createMarked('classes', secondaryClassId, {
      id: secondaryClassId, schoolId: cfg.fixtureSchoolId, name: '6e Fixture', cycle: 'secondary',
      section: 'francophone', isActive: true, academicYearId: yearId,
    });
    if (cfg.isPaymentLots123) {
      await createMarked('classes', class120Id, {
        id: class120Id, schoolId: cfg.fixtureSchoolId, name: 'LOT123 Class 120K', cycle: 'primary',
        section: 'francophone', isActive: true, academicYearId: yearId,
      });
      await createMarked('classes', class2Id, {
        id: class2Id, schoolId: cfg.fixtureSchoolId, name: 'LOT123 Class 2 installments', cycle: 'primary',
        section: 'francophone', isActive: true, academicYearId: yearId,
      });
    }
    for (const role of ['owner', 'secretary', 'accountant', 'director']) await createFixtureUser(role);
    await createFixtureUser('parent');
    await createFixtureUser('owner', otherSchoolId);

    const owner = await newClient('owner');
    const secretary = await newClient('secretary');
    const accountant = await newClient('accountant');
    const director = await newClient('director');
    const parent = await newClient('parent');
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
    if (cfg.isPaymentLots123) {
      checkpoint('LOT1_START');
      const class120Student = await createStudent('class120', 28, { classId: class120Id });
      const class2Student = await createStudent('class2', 28, { classId: class2Id });
      for (const studentId of [pk14, class120Student, class2Student]) {
        await db.collection('studentFinance').doc(studentId).update({ feeT1: 0, feeT2: 0, feeT3: 0 });
      }
      const tuition85 = await Promise.all(['T1', 'T2', 'T3'].map((installment) =>
        quote(secretary, pk14, 'tuition', { installment })));
      assert.deepEqual(tuition85.map((item) => item.grossExpectedAmount), [40_000, 30_000, 15_000]);
      const tuition120 = await Promise.all(['T1', 'T2', 'T3'].map((installment) =>
        quote(secretary, class120Student, 'tuition', { installment })));
      assert.deepEqual(tuition120.map((item) => item.grossExpectedAmount), [60_000, 40_000, 20_000]);
      assert.deepEqual((await Promise.all(['T1', 'T2'].map((installment) =>
        quote(secretary, class2Student, 'tuition', { installment })))).map((item) => item.grossExpectedAmount),
      [50_000, 35_000]);
      checkpoint('LOT1_CLASSFEES_PASS');
      await expectFailure({
        scenarioId: 'LOT1_TWO_INSTALLMENT_T3_DENY', lot: 1,
        operation: 'getCollectionQuote tuition T3', expectedCodes: ['GROSS_AMOUNT_NOT_CONFIGURED'],
        metadata: { studentId: class2Student, installment: 'T3', schoolId: cfg.fixtureSchoolId },
      }, () => quote(secretary, class2Student, 'tuition', { installment: 'T3' }));
      checkpoint('LOT1_T3_DENY_PASS');

      const tuitionPercentId = `lots123-tuition-percent-${cfg.testRunId}`.slice(0, 125);
      await createMarked('financialBenefits', tuitionPercentId, {
        id: tuitionPercentId, schoolId: cfg.fixtureSchoolId, studentId: class120Student, academicYear,
        requestId: tuitionPercentId, benefitType: 'SCHOLARSHIP', paymentType: 'TUITION', installment: 'T1',
        mode: 'PERCENTAGE', value: 10, status: 'approved', reason: 'Lots123 percentage fixture',
        stackable: true, usageCount: 0, maximumUses: 3, singleUse: false, appliedTargets: [],
        createdBy: credentials.get('owner').uid, approvedBy: credentials.get('owner').uid,
      });
      const discounted = await quote(secretary, class120Student, 'tuition', { installment: 'T1' });
      assert.deepEqual([discounted.grossExpectedAmount, discounted.discountAmount, discounted.netExpectedAmount],
        [60_000, 6_000, 54_000]);
      checkpoint('LOT1_BENEFIT_PASS');
      const tuitionMoratoriumId = `lots123-tuition-moratorium-${cfg.testRunId}`.slice(0, 125);
      await createMarked('paymentMoratoriums', tuitionMoratoriumId, {
        id: tuitionMoratoriumId, schoolId: cfg.fixtureSchoolId, studentId: pk14, academicYear,
        ...tuitionMoratoriumFixture,
        reason: 'Lots123 tuition moratorium', createdBy: credentials.get('owner').uid,
      });
      const delayed = await quote(secretary, pk14, 'tuition', { installment: 'T1' });
      assert.deepEqual([delayed.grossExpectedAmount, delayed.originalDueDate, delayed.effectiveDueDate],
        [PRODUCTION_LOTS123_TUITION_QUOTE.grossExpectedAmount,
          PRODUCTION_LOTS123_TUITION_QUOTE.originalDueDate,
          PRODUCTION_LOTS123_TUITION_QUOTE.effectiveDueDate]);
      checkpoint('LOT1_MORATORIUM_PASS');
      await pay(secretary, pk14, `lots123-tuition-partial-${cfg.testRunId}`, 10_000, 'tuition', { installment: 'T1' });
      const partialTuition = await quote(secretary, pk14, 'tuition', { installment: 'T1' });
      assert.deepEqual([partialTuition.previousPaid, partialTuition.remainingBalance], [10_000, 30_000]);
      checkpoint('LOT1_PARTIAL_PASS');
      checkpoint('LOT1_COMPLETE');

      checkpoint('LOT2_START');
      const editStudent = await createStudent('lot2-edit', 28);
      const financeBeforeEdit = JSON.stringify((await db.collection('studentFinance').doc(editStudent).get()).data());
      const paymentsBeforeEdit = (await db.collection('payments').where('studentId', '==', editStudent).get()).size;
      const secretaryFixtureUid = credentials.get('secretary').uid;
      await updateDoc(doc(secretary.firestore, 'studentPrivate', editStudent),
        buildStudentPrivateTransportAuditUpdate({
          transportZonePk: 35, transportNeighborhood: 'Quartier B', transportPickupPoint: 'Point B',
          updatedAt: serverTimestamp(), updatedBy: secretaryFixtureUid, secretaryFixtureUid,
        }));
      await updateDoc(doc(secretary.firestore, 'students', editStudent), { usesTransport: false, transportStatus: 'none' });
      await updateDoc(doc(secretary.firestore, 'students', editStudent), { usesTransport: true, transportStatus: 'active' });
      const reloadedPrivate = (await getDoc(doc(secretary.firestore, 'studentPrivate', editStudent))).data();
      assert.deepEqual([reloadedPrivate.transportZonePk, reloadedPrivate.transportNeighborhood,
        reloadedPrivate.transportPickupPoint], [35, 'Quartier B', 'Point B']);
      assert.equal(JSON.stringify((await db.collection('studentFinance').doc(editStudent).get()).data()), financeBeforeEdit);
      assert.equal((await db.collection('payments').where('studentId', '==', editStudent).get()).size, paymentsBeforeEdit);
      checkpoint('LOT2_STUDENTPRIVATE_UPDATE_PASS');
      await expectFailure({
        scenarioId: 'LOT2_PARENT_WRITE_DENY', lot: 2,
        operation: 'parent update students usesTransport', expectedCodes: ['permission-denied'],
        metadata: { studentId: editStudent, collection: 'students', schoolId: cfg.fixtureSchoolId },
      }, () => updateDoc(doc(parent.firestore, 'students', editStudent), { usesTransport: false }));
      checkpoint('LOT2_PARENT_DENY_PASS');
    }

    await db.collection('studentPrivate').doc(invalid).update({ transportZonePk: 13 });
    await expectFailure({
      scenarioId: 'LOT2_PRIMARY_OUTSIDE_POLICY_DENY', lot: 2,
      operation: 'getCollectionQuote transport outside policy', expectedCodes: ['TRANSPORT_ZONE_OUTSIDE_POLICY'],
      metadata: { studentId: invalid, schoolId: cfg.fixtureSchoolId },
    }, () => quote(secretary, invalid));
    checkpoint('LOT2_PRIMARY_INCOMPLETE_PASS');
    const secondaryQuote = await quote(secretary, secondary);
    assert.deepEqual({ state: secondaryQuote.transportState, monthly: secondaryQuote.monthlyGrossAmount,
      remaining: secondaryQuote.remainingBalance }, { state: 'FREE_SECONDARY', monthly: 0, remaining: 0 });
    await expectFailure({
      scenarioId: 'LOT2_SECONDARY_FREE_PAYMENT_DENY', lot: 2,
      operation: 'recordCashPayment transport secondary free', expectedCodes: ['TRANSPORT_FREE_SECONDARY'],
      metadata: { studentId: secondary, schoolId: cfg.fixtureSchoolId },
    }, () => pay(secretary, secondary, `secondary-deny-${cfg.testRunId}`, 1_000));
    checkpoint('LOT2_SECONDARY_FREE_PASS');
    checkpoint('LOT2_COMPLETE');

    checkpoint('LOT3_START');
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
    assert.deepEqual(await Promise.all([pk14, pk33, pk34, pk42].map(async (id) =>
      (await db.collection('studentPrivate').doc(id).get()).data().transportZonePk)), [14, 33, 34, 42]);

    const boundary = await Promise.all([pk14, pk33, pk34, pk42].map((id) => quote(secretary, id)));
    assert.deepEqual(boundary.map((q) => q.monthlyGrossAmount), [4_000, 4_000, 5_000, 5_000]);
    checkpoint('LOT3_PK28_PASS');
    checkpoint('LOT3_PK35_PASS');

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

    await db.collection('users').doc(credentials.get('parent').uid).update({ studentIds: [pk14] });
    const otherSchoolReceiptId = `transport-other-receipt-${cfg.testRunId}`.slice(0, 125);
    await createMarked('receipts', otherSchoolReceiptId, {
      id: otherSchoolReceiptId, paymentId: otherSchoolReceiptId,
      receiptNumber: `REC-X-${cfg.testRunId}`.slice(0, 80),
      schoolId: otherSchoolId, studentId: `transport-other-student-${cfg.testRunId}`.slice(0, 125),
      academicYear, paymentType: 'transport', type: 'transport',
      amount: 5_000, date: todayDouala(),
    });
    assert.equal((await getDoc(doc(parent.firestore, 'receipts', p4000.receiptId))).exists(), true,
      'Receipt Privacy: parent must read own child receipt.');
    await expectFailure({
      scenarioId: 'LOT3_RECEIPT_PARENT_UNRELATED_DENY', lot: 3,
      operation: 'parent read unrelated receipt', expectedCodes: ['permission-denied'],
      metadata: { receiptId: p5000.receiptId, collection: 'receipts' },
    }, () => getDoc(doc(parent.firestore, 'receipts', p5000.receiptId)));
    await expectFailure({
      scenarioId: 'LOT3_RECEIPT_PARENT_CROSS_SCHOOL_DENY', lot: 3,
      operation: 'parent read cross-school receipt', expectedCodes: ['permission-denied'],
      metadata: { receiptId: otherSchoolReceiptId, collection: 'receipts' },
    }, () => getDoc(doc(parent.firestore, 'receipts', otherSchoolReceiptId)));
    assert.equal((await getDoc(doc(secretary.firestore, 'receipts', p4000.receiptId))).exists(), true,
      'Receipt Privacy: same-school secretary must read receipt.');
    assert.equal((await getDoc(doc(owner.firestore, 'receipts', p4000.receiptId))).exists(), true,
      'Receipt Privacy: same-school owner must read receipt.');
    await expectFailure({
      scenarioId: 'LOT3_RECEIPT_CROSS_OWNER_DENY', lot: 3,
      operation: 'cross-school owner read receipt', expectedCodes: ['permission-denied'],
      metadata: { receiptId: p4000.receiptId, collection: 'receipts' },
    }, () => getDoc(doc(crossOwner.firestore, 'receipts', p4000.receiptId)));
    const partial = await pay(secretary, pk42, `pk42-partial-${cfg.testRunId}`, 2_000);
    assert.equal(partial.allocations[0].amount, 2_000);
    assert.equal((await quote(secretary, pk42)).installments[0].remainingBalance, 3_000);
    checkpoint('LOT3_PARTIAL_PASS');
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
    checkpoint('LOT3_ALLOCATIONS_PASS');

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

    const expectTransportBenefitApprovalDenied = async (studentId, label, code, scenarioId) => {
      const created = await call(owner, 'createFinancialBenefit', {
        schoolId: cfg.fixtureSchoolId, studentId, academicYear,
        requestId: `approval-deny-${label}-${cfg.testRunId}`, benefitType: 'SCHOLARSHIP', paymentType: 'TRANSPORT',
        mode: 'FIXED_AMOUNT', value: 100, transportStartPeriod: periods[0], transportEndPeriod: periods[0],
        stackable: true, reason: `Fixture approval deny ${label}`, maximumUses: 1,
      });
      mark('financialBenefits', created.benefitId);
      await expectFailure({
        scenarioId, lot: 3, operation: `approveFinancialBenefit ${label}`, expectedCodes: [code],
        metadata: { studentId, benefitId: created.benefitId, schoolId: cfg.fixtureSchoolId },
      }, () => call(owner, 'approveFinancialBenefit', { benefitId: created.benefitId }));
    };
    await expectTransportBenefitApprovalDenied(secondary, 'secondary', 'TRANSPORT_FREE_SECONDARY',
      'LOT3_BENEFIT_SECONDARY_FREE_DENY');
    assert.equal((await quote(secretary, secondary)).remainingBalance, 0);
    const missingPkStudent = await createStudent('benefit-approval-missing-pk', undefined);
    await expectTransportBenefitApprovalDenied(missingPkStudent, 'missing-pk', 'TRANSPORT_ZONE_REQUIRED',
      'LOT3_BENEFIT_MISSING_PK_DENY');
    await expectTransportBenefitApprovalDenied(invalid, 'outside-pk', 'TRANSPORT_ZONE_OUTSIDE_POLICY',
      'LOT3_BENEFIT_OUTSIDE_PK_DENY');

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
    await expectFailure({
      scenarioId: 'LOT3_DUPLICATE_VOUCHER_REFERENCE_DENY', lot: 3,
      operation: 'approveFinancialBenefit duplicate voucher', expectedCodes: ['VOUCHER_REFERENCE_ALREADY_USED'],
      metadata: { benefitId: secondDuplicate.benefitId, reference: duplicateReference },
    }, () => call(owner, 'approveFinancialBenefit', { benefitId: secondDuplicate.benefitId }));
    checkpoint('LOT3_BENEFIT_PASS');

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
    checkpoint('LOT3_MORATORIUM_PASS');

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
    await expectFailure({
      scenarioId: 'LOT3_SECRETARY_REVERSAL_DENY', lot: 3,
      operation: 'reversePayment by secretary', expectedCodes: ['PERMISSION_DENIED'],
      metadata: { paymentId: original.paymentId, schoolId: cfg.fixtureSchoolId },
    }, () => reverse(secretary, original.paymentId, `reverse-secretary-${cfg.testRunId}`, 'Refus secrétaire'));
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

    await expectFailure({
      scenarioId: 'LOT3_CROSS_SCHOOL_PAYMENT_DENY', lot: 3,
      operation: 'recordCashPayment cross-school owner', expectedCodes: ['CROSS_SCHOOL_DENIED'],
      metadata: { studentId: pk42, schoolId: cfg.fixtureSchoolId },
    }, () => call(crossOwner, 'recordCashPayment', crossInput));
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
      await expectFailure({
        scenarioId: 'LOT3_DIRECT_FINANCIAL_CREATE_DENY', lot: 3,
        operation: 'direct financial document create', expectedCodes: ['permission-denied'],
        metadata: { collection, documentId: directId, schoolId: cfg.fixtureSchoolId },
      }, () => setDoc(doc(secretary.firestore, collection, directId),
        { schoolId: cfg.fixtureSchoolId, testFixture: true, testRunId: cfg.testRunId }));
      await expectFailure({
        scenarioId: 'LOT3_DIRECT_FINANCIAL_UPDATE_DENY', lot: 3,
        operation: 'direct financial document update', expectedCodes: ['permission-denied'],
        metadata: { collection, documentId: id, schoolId: cfg.fixtureSchoolId },
      }, () => updateDoc(doc(secretary.firestore, collection, id), { amount: 1 }));
      await expectFailure({
        scenarioId: 'LOT3_DIRECT_FINANCIAL_DELETE_DENY', lot: 3,
        operation: 'direct financial document delete', expectedCodes: ['permission-denied'],
        metadata: { collection, documentId: id, schoolId: cfg.fixtureSchoolId },
      }, () => deleteDoc(doc(secretary.firestore, collection, id)));
    }
    const missingFinanceStudentId = `transport-legacy-finance-${cfg.testRunId}`.slice(0, 125);
    await createMarked('students', missingFinanceStudentId, {
      id: missingFinanceStudentId, schoolId: cfg.fixtureSchoolId,
      name: 'Transport legacy finance fixture', classId: primaryClassId,
      academicYear, active: true, isActive: true,
    });
    const directFinancePayloads = [
      { transportMonthlyFee: 4_000, transportPaid: 4_000 },
      { transportByPeriod: { [periods[0]]: { paidAmount: 4_000 } } },
      { transportExpectedGross: 20_000, transportExpectedNet: 20_000, transportPaid: 20_000 },
    ];
    for (const [role, client] of [['owner', owner], ['secretary', secretary], ['accountant', accountant], ['director', director]]) {
      for (const projection of directFinancePayloads) {
        await expectFailure({
          scenarioId: 'LOT3_DIRECT_STUDENT_FINANCE_CREATE_DENY', lot: 3,
          operation: 'direct studentFinance create', expectedCodes: ['permission-denied'],
          metadata: { role, studentId: missingFinanceStudentId, schoolId: cfg.fixtureSchoolId },
        }, () => setDoc(doc(client.firestore, 'studentFinance', missingFinanceStudentId), {
          id: missingFinanceStudentId, studentId: missingFinanceStudentId,
          schoolId: cfg.fixtureSchoolId, ...projection,
          createdAt: new Date().toISOString(), createdBy: credentials.get(role).uid,
          updatedAt: new Date().toISOString(), updatedBy: credentials.get(role).uid,
        }));
      }
    }
    assert.equal((await db.collection('studentFinance').doc(missingFinanceStudentId).get()).exists, false);

    const tuitionStudent = await createStudent('tuition-cash', 20);
    const tuitionBefore = await quote(secretary, tuitionStudent, 'tuition', { installment: 'T1' });
    await pay(secretary, tuitionStudent, `tuition-cash-${cfg.testRunId}`, 5_000, 'tuition', { installment: 'T1' });
    assert.equal((await quote(secretary, tuitionStudent)).previousPaid, 0);
    assert.equal((await quote(secretary, benefitStudent, 'tuition', { installment: 'T2' })).discountAmount, 0);
    assert.equal(tuitionBefore.grossExpectedAmount, cfg.isPaymentLots123 ? 40_000 : 70_000);
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
      const pageMetrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
      assert.ok(pageMetrics.documentWidth <= pageMetrics.viewportWidth + 1,
        `Payments page overflows viewport at ${width}px.`);
      const openCashButton = page.getByTestId('open-cash-payment');
      const openCashBox = await openCashButton.boundingBox();
      assert.ok(openCashBox && openCashBox.x >= 0 && openCashBox.x + openCashBox.width <= width + 1,
        `Cash action is outside viewport at ${width}px.`);
      assert.ok(openCashBox.height >= 40, `Cash action touch target is too small at ${width}px.`);
      await openCashButton.click();
      await page.getByTestId('cash-payment-student').selectOption(benefitStudent);
      await page.getByTestId('cash-payment-type').selectOption('transport');
      await page.getByTestId('transport-auto-allocation').waitFor({ state: 'visible' });
      await page.getByText(/Zone PK34/).waitFor({ state: 'visible' });
      await page.getByText(/Mensualité brute/).waitFor({ state: 'visible' });
      await page.getByText(/Bourse \/ réduction applicable/).waitFor({ state: 'visible' });
      await page.getByText(/Moratoire/).waitFor({ state: 'visible' });
      const modalMetrics = await page.getByTestId('modal-content').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left, right: rect.right, width: rect.width,
          clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        };
      });
      assert.ok(modalMetrics.left >= 0 && modalMetrics.right <= width + 1 && modalMetrics.width <= width,
        `Cash modal is outside viewport at ${width}px.`);
      assert.ok(modalMetrics.scrollWidth <= modalMetrics.clientWidth + 1,
        `Cash modal has uncontrolled horizontal overflow at ${width}px.`);
      const scheduleScroll = page.getByTestId('transport-installments-scroll');
      const scheduleMetrics = await scheduleScroll.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
      }));
      assert.ok(['auto', 'scroll'].includes(scheduleMetrics.overflowX));
      assert.ok(scheduleMetrics.clientWidth <= modalMetrics.clientWidth);
      const submitAction = page.getByTestId('cash-payment-submit');
      await submitAction.scrollIntoViewIfNeeded();
      const submitBox = await submitAction.boundingBox();
      assert.ok(submitBox && submitBox.x >= 0 && submitBox.x + submitBox.width <= width + 1,
        `Cash submit action is outside viewport at ${width}px.`);
      assert.ok(submitBox.height >= 40, `Cash submit touch target is too small at ${width}px.`);
      await page.getByTestId('cash-payment-student').selectOption(secondary);
      await page.getByTestId('transport-free-secondary').waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('cash-payment-submit').isDisabled(), true);
      await page.getByRole('button', { name: 'Annuler', exact: true }).click();

      await page.getByRole('button', { name: 'Reçus', exact: true }).click();
      await page.getByText(creditReceipt.receiptNumber, { exact: true }).waitFor({ timeout: 20_000 });
      const receiptRow = page.locator('[data-receipt-row="true"]:visible')
        .filter({ hasText: creditReceipt.receiptNumber });
      await receiptRow.waitFor({ state: 'visible' });
      assert.equal(await receiptRow.count(), 1,
        `Expected one visible row for receipt ${creditReceipt.receiptNumber} at ${width}px.`);
      const detailToggle = receiptRow.getByTestId(`receipt-detail-toggle-${credit.receiptId}`);
      await detailToggle.waitFor({ state: 'visible' });
      assert.equal(await detailToggle.isEnabled(), true);
      const waitForToggleState = async (expanded) => page.waitForFunction(
        ({ testId, expected }) => document.querySelector(`[data-testid="${testId}"]`)
          ?.getAttribute('aria-expanded') === expected,
        { testId: `receipt-detail-toggle-${credit.receiptId}`, expected: String(expanded) },
      );
      if (await detailToggle.getAttribute('aria-expanded') === 'true') {
        await detailToggle.click();
        await page.getByTestId(`receipt-detail-${credit.receiptId}`).waitFor({ state: 'hidden' });
        await waitForToggleState(false);
      }
      assert.equal(await detailToggle.getAttribute('aria-expanded'), 'false');
      const detailToggleBox = await detailToggle.boundingBox();
      assert.ok(detailToggleBox && detailToggleBox.width >= 44 && detailToggleBox.height >= 44,
        `Receipt detail touch target is too small at ${width}px.`);
      await detailToggle.click();
      await waitForToggleState(true);
      assert.equal(await detailToggle.getAttribute('aria-expanded'), 'true');
      const receiptDetail = page.getByTestId(`receipt-detail-${credit.receiptId}`);
      await receiptDetail.waitFor({ state: 'visible' });
      const allocationPanel = page.getByTestId(`transport-receipt-allocation-${credit.receiptId}`);
      await allocationPanel.waitFor({ state: 'visible' });
      await allocationPanel.getByText(periods.at(-1), { exact: false }).waitFor();
      await allocationPanel.getByText(/Crédit disponible/i).waitFor();
      const receiptMetrics = await page.getByTestId('receipt-history-scroll').evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
      }));
      assert.ok(receiptMetrics.clientWidth <= width);
      if (width <= 899) {
        assert.ok(receiptMetrics.scrollWidth <= receiptMetrics.clientWidth + 1,
          `Receipt history requires horizontal scrolling at ${width}px.`);
        assert.equal(receiptMetrics.overflowX, 'visible');
      } else {
        assert.ok(['auto', 'scroll'].includes(receiptMetrics.overflowX));
      }
      const detailBox = await receiptDetail.boundingBox();
      assert.ok(detailBox && detailBox.x >= 0 && detailBox.x + detailBox.width <= width + 1,
        `Receipt detail is outside viewport at ${width}px.`);
      const allocationBox = await allocationPanel.boundingBox();
      assert.ok(allocationBox && allocationBox.x >= 0 && allocationBox.x + allocationBox.width <= width + 1,
        `Receipt allocation is outside viewport at ${width}px.`);
      const allocationDirection = await allocationPanel.locator('.receipt-history-allocation-row').first()
        .evaluate((element) => getComputedStyle(element).flexDirection);
      assert.equal(allocationDirection, width <= 899 ? 'column' : 'row');
      const creditDisplay = allocationPanel.getByText(/Crédit disponible/i);
      const creditBox = await creditDisplay.boundingBox();
      assert.ok(creditBox && creditBox.x >= 0 && creditBox.x + creditBox.width <= width + 1,
        `Transport credit is clipped at ${width}px.`);
      const printAction = receiptRow.getByRole('button', { name: 'Imprimer', exact: true });
      await printAction.scrollIntoViewIfNeeded();
      const printBox = await printAction.boundingBox();
      assert.ok(printBox && printBox.x >= 0 && printBox.x + printBox.width <= width + 1,
        `Receipt print action is outside viewport at ${width}px.`);
      assert.ok(printBox.height >= 44, `Receipt print touch target is too small at ${width}px.`);
      const expandedPageMetrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
      assert.ok(expandedPageMetrics.documentWidth <= expandedPageMetrics.viewportWidth + 1,
        `Expanded receipt causes global overflow at ${width}px.`);
      await detailToggle.click();
      await receiptDetail.waitFor({ state: 'hidden' });
      await waitForToggleState(false);
      assert.equal(await detailToggle.getAttribute('aria-expanded'), 'false');
    }
    checkpoint('LOT3_RECEIPT_PASS');
    assertTransportEnvironmentEvidence({ expectedProject: cfg.expectedProject, runtimeProjectId: runtimeProject,
      networkProjectIds: [...firebaseProjects] });
    results = {
      pk14: 4_000, pk33: 4_000, pk34: 5_000, pk42: 5_000, secondary: 'FREE',
      allocation4000: p4000.allocations, allocation5000: p5000.allocations,
      partialRemaining: 3_000, credit: 2_000, benefits: 'PASS', moratorium: 'PASS',
      idempotence: 'PASS', concurrency: 'PASS', reversal: 'PASS', cashClosure: expectedCash,
      tuitionIsolation: 'PASS', rbac: 'PASS', directWrites: 'DENY',
      responsive: { widths, documentOverflow: 'PASS', actions: 'PASS', receiptAllocation: 'PASS' },
      receiptPrivacy: {
        ownChild: 'ALLOW', sameSchoolUnrelatedChild: 'DENY', otherSchool: 'DENY',
        secretary: 'ALLOW', owner: 'ALLOW', crossSchool: 'DENY',
      },
    };
    checkpoint('LOT3_COMPLETE');
    checkpoint('PAYMENT_LOTS123_COMPLETE');
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
        const collectionRefs = [];
        if (cfg.isPaymentLots123) {
          for (const schoolId of fixtureSchoolIds) {
            const bySchool = await db.collection(collection).where('schoolId', '==', schoolId).get();
            for (const item of bySchool.docs) {
              assert.equal(item.data().schoolId, schoolId, 'Cleanup school ownership mismatch.');
              collectionRefs.push(item.ref);
            }
          }
        } else {
          const byRun = await db.collection(collection).where('testRunId', '==', cfg.testRunId).get();
          refs.push(...byRun.docs.map((item) => item.ref));
          if (['audit_logs', 'cashClosures'].includes(collection)) {
            for (const schoolId of fixtureSchoolIds) {
              const bySchool = await db.collection(collection).where('schoolId', '==', schoolId).get();
              refs.push(...bySchool.docs.map((item) => item.ref));
            }
          }
        }
        for (const id of manifest[collection] || []) collectionRefs.push(db.collection(collection).doc(id));
        if (cfg.isPaymentLots123) {
          await deleteRefs(db, collectionRefs);
          if (collection === 'transportPaymentAllocations') {
            await new Promise((resolve) => setTimeout(resolve, 1_500));
          }
        } else refs.push(...collectionRefs);
      }
      const counterRefs = [db.collection('counters').doc(`receipts_${cfg.fixtureSchoolId}`),
        db.collection('counters').doc(`receipts_${otherSchoolId}`)];
      if (cfg.isPaymentLots123) await deleteRefs(db, counterRefs);
      else refs.push(...counterRefs);
      await deleteRefs(db, refs);
      for (const uid of manifest.authUsers) await adminAuth.deleteUser(uid).catch((error) => {
        if (error?.code !== 'auth/user-not-found') throw error;
      });
      if (round === 0) await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    const residuals = {};
    for (const collection of FIXTURE_COLLECTIONS) {
      const paths = new Set();
      if (cfg.isPaymentLots123) {
        for (const schoolId of fixtureSchoolIds) {
          const bySchool = await db.collection(collection).where('schoolId', '==', schoolId).get();
          bySchool.docs.forEach((item) => paths.add(item.ref.path));
        }
        for (const id of manifest[collection] || []) {
          const exact = await db.collection(collection).doc(id).get();
          if (exact.exists) paths.add(exact.ref.path);
        }
      } else {
        const byRun = await db.collection(collection).where('testRunId', '==', cfg.testRunId).get();
        byRun.docs.forEach((item) => paths.add(item.ref.path));
        for (const schoolId of fixtureSchoolIds) {
          const bySchool = await db.collection(collection).where('schoolId', '==', schoolId).get();
          bySchool.docs.filter((item) => item.data().testRunId !== cfg.testRunId)
            .forEach((item) => paths.add(item.ref.path));
        }
      }
      residuals[collection] = paths.size;
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
    console.error(`PAYMENT_LOTS123_FAILURE ${JSON.stringify(paymentFailureMarker(error))}`);
    console.error(redactDiagnosticText(error?.stack || error?.message || error));
    console.error(`TRANSPORT RELEASE RUNNER: FAIL ${error?.code || 'UNKNOWN'} ${redactDiagnosticText(error?.message || error)}`);
    process.exitCode = 1;
  });
}
