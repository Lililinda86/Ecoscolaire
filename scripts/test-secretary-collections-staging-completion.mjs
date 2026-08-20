import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { chromium } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  assertAutomationBypassSecret,
  assertProtectedPreviewLoaded,
  assertStagingFirebasePrecheck,
  assertStagingRuntimeProject,
  classifyFirebaseRequest,
} from './staging-firebase-precheck.mjs';

const EXPECTED_PROJECT = 'ecoscolaire-staging';
const PRODUCTION_PROJECT = 'ecoscolaire-c5861';
const SECRETARY_EMAIL = 'secretary.alpha@ecoscolaire.com';
const REQUIRED_ENV = [
  'STAGING_APP_URL',
  'STAGING_FIREBASE_SERVICE_ACCOUNT',
  'STAGING_TEST_ALPHA_PASSWORD',
  'STAGING_FIREBASE_API_KEY',
  'STAGING_FIREBASE_AUTH_DOMAIN',
  'STAGING_FIREBASE_PROJECT_ID',
  'STAGING_FIREBASE_STORAGE_BUCKET',
  'STAGING_FIREBASE_MESSAGING_SENDER_ID',
  'STAGING_FIREBASE_APP_ID',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
];

const requireEnvironment = () => {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing required staging secrets: ${missing.join(', ')}`);
  assertAutomationBypassSecret(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  if (process.env.STAGING_FIREBASE_PROJECT_ID !== EXPECTED_PROJECT
      || process.env.STAGING_FIREBASE_PROJECT_ID === PRODUCTION_PROJECT) {
    throw new Error('Refusing to run: Firebase target is not the authorized staging project.');
  }
  const url = new URL(process.env.STAGING_APP_URL);
  if (url.protocol !== 'https:'
      || !/^ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/.test(url.hostname)) {
    throw new Error('Refusing to run: STAGING_APP_URL is not an immutable Vercel Preview URL.');
  }
  return url.origin;
};

const redactSecrets = (value) => {
  let clean = String(value || 'Unknown failure');
  for (const name of REQUIRED_ENV) {
    if (name === 'STAGING_APP_URL') continue;
    const secret = process.env[name];
    if (secret && secret.length >= 4) clean = clean.split(secret).join('[REDACTED]');
  }
  return clean;
};

const businessCode = (error) => error?.details?.businessCode || null;

const expectCallableFailure = async (operation, expectedCodes) => {
  try {
    await operation();
    assert.fail(`Expected callable failure: ${expectedCodes.join(' or ')}`);
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    assert.ok(
      expectedCodes.includes(businessCode(error)) || expectedCodes.includes(error?.code),
      `Unexpected callable error (${error?.code || 'unknown'} / ${businessCode(error) || 'no-business-code'})`,
    );
  }
};

const doualaDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const addCalendarDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const makeLegacySlotId = ({ schoolId, studentId, academicYear, installment }) => {
  const canonical = JSON.stringify({ schoolId, studentId, academicYear, installment });
  return `slot_${crypto.createHash('sha256').update(canonical).digest('hex')}`;
};

const stableStringify = (value) => JSON.stringify((function sortDeep(item) {
  if (Array.isArray(item)) return item.map(sortDeep);
  if (!item || typeof item !== 'object') return item;
  return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sortDeep(item[key])]));
}(value)));

const deleteSnapshots = async (db, snapshots) => {
  const refs = snapshots.flatMap((snapshot) => snapshot?.docs || [snapshot])
    .filter((snapshot) => snapshot?.exists !== false)
    .map((snapshot) => snapshot?.ref)
    .filter(Boolean);
  while (refs.length) {
    const batch = db.batch();
    refs.splice(0, 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

const waitForSinglePayment = async (db, studentId) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const snapshot = await db.collection('payments').where('studentId', '==', studentId).get();
    if (snapshot.size === 1) return snapshot.docs[0];
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for the unique UI payment for ${studentId}.`);
};

const run = async () => {
  const appUrl = requireEnvironment();
  const runToken = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '1').replace(/[^A-Za-z0-9_-]/g, '-');
  const suffix = `${runToken}-${attempt}`;
  const marker = `E2E-PAYMENTS-COMPLETE-${suffix}`;
  const studentIds = {
    main: `e2e-complete-main-${suffix}`,
    percentage: `e2e-complete-percentage-${suffix}`,
    legacy: `e2e-complete-legacy-${suffix}`,
    responsive360: `e2e-complete-responsive-360-${suffix}`,
    responsive768: `e2e-complete-responsive-768-${suffix}`,
    responsive1440: `e2e-complete-responsive-1440-${suffix}`,
  };
  const benefitIds = {
    scholarship: `e2e-complete-scholarship-${suffix}`,
    fixedDiscount: `e2e-complete-fixed-discount-${suffix}`,
    percentage: `e2e-complete-percentage-benefit-${suffix}`,
  };
  const legacyDiscountId = `e2e-complete-legacy-discount-${suffix}`;
  let legacySlotId = null;
  const moratoriumId = `e2e-complete-moratorium-${suffix}`;
  const requestIds = {
    mainT1Partial: `e2e-complete-main-t1-partial-${suffix}`,
    percentagePartial: `e2e-complete-percentage-partial-${suffix}`,
    percentageFull: `e2e-complete-percentage-full-${suffix}`,
    legacyPartial: `e2e-complete-legacy-partial-${suffix}`,
    cashA: `e2e-complete-cash-a-${suffix}`,
    cashB: `e2e-complete-cash-b-${suffix}`,
    cashC: `e2e-complete-cash-c-${suffix}`,
    reverseB: `e2e-complete-reverse-b-${suffix}`,
    reverseC1: `e2e-complete-reverse-c1-${suffix}`,
    reverseC2: `e2e-complete-reverse-c2-${suffix}`,
  };

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT);
  } catch {
    throw new Error('STAGING_FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
  }
  if (serviceAccount.project_id !== EXPECTED_PROJECT || serviceAccount.project_id === PRODUCTION_PROJECT) {
    throw new Error('Refusing to run: the service account does not target staging.');
  }

  const adminApp = initializeAdminApp({ credential: cert(serviceAccount) }, `collections-complete-${suffix}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const precheckContext = await browser.newContext({ acceptDownloads: false });
  const precheckPage = await precheckContext.newPage();
  await precheckPage.route(`${appUrl}/**`, async (route) => route.continue({
    headers: {
      ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'x-vercel-set-bypass-cookie': 'true',
    },
  }));
  const firebaseRequestUrls = [];
  precheckPage.on('request', (request) => {
    if (classifyFirebaseRequest(request.url()).relevant) firebaseRequestUrls.push(request.url());
  });

  let secretaryApp;
  let ownerApp;
  let ownerRaceApp;
  let otherOwnerApp;
  let secretaryAuth;
  let ownerAuth;
  let ownerRaceAuth;
  let otherOwnerAuth;
  let secretaryUid = null;
  let ownerUid = null;
  let otherOwnerUid = null;
  let testSchoolId = null;
  let academicYear = null;
  let primaryClassId = null;
  let schoolBefore = null;
  let deadlineFixture = null;
  let paymentSettingsFixture = null;
  let closureId = null;
  let referenceId = null;
  const targetIds = new Set(Object.values(benefitIds));
  const paymentIds = new Set();
  const receiptIds = new Set();
  const createdAuthUids = new Set();

  const firebaseConfig = {
    apiKey: process.env.STAGING_FIREBASE_API_KEY,
    authDomain: process.env.STAGING_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
    storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.STAGING_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.STAGING_FIREBASE_APP_ID,
  };
  const makeClient = (name) => {
    const app = initializeApp(firebaseConfig, name);
    return { app, auth: getAuth(app), functions: getFunctions(app, 'us-central1') };
  };

  try {
    console.log(`TEST RUN ID: ${suffix}`);
    console.log('PRECHECK COMPLETE: runtime staging target before fixture creation');
    const stagingRequest = precheckPage.waitForRequest(
      (request) => classifyFirebaseRequest(request.url()).staging,
      { timeout: 30_000 },
    );
    await precheckPage.goto(`${appUrl}/#/diagnostic`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: precheckPage.url() });
    const runtimeProjectElement = precheckPage.getByTestId('diagnostic-firebase-project');
    await runtimeProjectElement.waitFor({ state: 'visible', timeout: 30_000 });
    const runtimeProject = (await runtimeProjectElement.textContent())?.trim() || '';
    assertStagingRuntimeProject(runtimeProject);
    assert.notEqual(runtimeProject, PRODUCTION_PROJECT);
    const networkProbeUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(runtimeProject)}/databases/(default)/documents/__e2e_precheck__/network-probe`;
    await precheckPage.evaluate(async (url) => {
      await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit' }).catch(() => undefined);
    }, networkProbeUrl);
    await stagingRequest;
    const isolation = assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequestUrls });
    console.log(`PRECHECK COMPLETE: runtime=${isolation.runtimeProject}, staging requests=${isolation.stagingRequests}, production requests=0`);

    const secretaryAccount = await adminAuth.getUserByEmail(SECRETARY_EMAIL);
    secretaryUid = secretaryAccount.uid;
    const secretaryProfile = await db.collection('users').doc(secretaryUid).get();
    assert.equal(secretaryProfile.exists, true);
    const secretary = secretaryProfile.data() || {};
    assert.equal(secretary.role, 'secretary');
    assert.equal(secretary.active === true || secretary.isActive === true, true);
    testSchoolId = String(secretary.schoolId || '').trim();
    assert.ok(testSchoolId);

    const schoolRef = db.collection('schools').doc(testSchoolId);
    const schoolSnapshot = await schoolRef.get();
    assert.equal(schoolSnapshot.exists, true);
    schoolBefore = schoolSnapshot.data() || {};
    const activeAcademicYearId = String(schoolBefore.activeAcademicYearId || '').trim();
    assert.ok(activeAcademicYearId && !activeAcademicYearId.includes('/'));
    const academicYearSnapshot = await db.collection('academicYears').doc(activeAcademicYearId).get();
    assert.equal(academicYearSnapshot.exists, true);
    const academicYearData = academicYearSnapshot.data() || {};
    assert.equal(academicYearData.schoolId, testSchoolId);
    assert.equal(academicYearData.status, 'active');
    academicYear = String(academicYearData.name || '');
    assert.match(academicYear, /^\d{4}-\d{4}$/);
    legacySlotId = makeLegacySlotId({
      schoolId: testSchoolId, studentId: studentIds.legacy, academicYear, installment: 'T1',
    });

    const classes = await db.collection('classes').where('schoolId', '==', testSchoolId).get();
    const primaryClass = classes.docs.find((item) => {
      const data = item.data();
      const cycle = String(data.cycle || data.level || '').toLowerCase();
      return data.isActive !== false && (
        ['primary', 'primaire'].includes(cycle)
        || ['SIL', 'CP', 'CE1', 'CE2', 'CM1'].includes(String(data.name))
      );
    });
    assert.ok(primaryClass, 'No same-school primary class is available for completion fixtures.');
    primaryClassId = primaryClass.id;

    const today = doualaDate();
    const originalDueDate = addCalendarDays(today, -30);
    const futureDueDate = addCalendarDays(today, 60);
    const moratoriumDueDate = addCalendarDays(today, 90);
    deadlineFixture = {
      registrationFee: originalDueDate,
      tuition: { T1: originalDueDate, T2: futureDueDate, T3: originalDueDate },
      transport: {},
    };
    paymentSettingsFixture = { ...(schoolBefore.paymentSettings || {}), activeProvider: 'none' };
    const preexistingClosureId = `${testSchoolId}__${today}`;
    assert.equal((await db.collection('cashClosures').doc(preexistingClosureId).get()).exists, false,
      'A same-school staging cash closure already exists for today.');
    await schoolRef.update({
      paymentDeadlines: deadlineFixture,
      paymentSettings: paymentSettingsFixture,
      e2ePaymentsLiveConfig: { testFixture: true, testRunId: suffix },
    });

    const tempPassword = `Aa1!${crypto.randomBytes(24).toString('base64url')}`;
    const ownerEmail = `e2e-owner-${suffix}@tests.ecoscolaire.invalid`;
    const otherOwnerEmail = `e2e-other-owner-${suffix}@tests.ecoscolaire.invalid`;
    const ownerUser = await adminAuth.createUser({ email: ownerEmail, password: tempPassword, disabled: false });
    ownerUid = ownerUser.uid;
    createdAuthUids.add(ownerUid);
    const otherOwnerUser = await adminAuth.createUser({ email: otherOwnerEmail, password: tempPassword, disabled: false });
    otherOwnerUid = otherOwnerUser.uid;
    createdAuthUids.add(otherOwnerUid);
    await Promise.all([
      db.collection('users').doc(ownerUid).create({
        id: ownerUid, email: ownerEmail, role: 'owner', schoolId: testSchoolId,
        active: true, isActive: true, testFixture: true, testRunId: suffix,
      }),
      db.collection('users').doc(otherOwnerUid).create({
        id: otherOwnerUid, email: otherOwnerEmail, role: 'owner',
        schoolId: `e2e-other-school-${suffix}`, active: true, isActive: true,
        testFixture: true, testRunId: suffix,
      }),
    ]);

    secretaryApp = makeClient(`completion-secretary-${suffix}`).app;
    ownerApp = makeClient(`completion-owner-${suffix}`).app;
    ownerRaceApp = makeClient(`completion-owner-race-${suffix}`).app;
    otherOwnerApp = makeClient(`completion-other-owner-${suffix}`).app;
    secretaryAuth = getAuth(secretaryApp);
    ownerAuth = getAuth(ownerApp);
    ownerRaceAuth = getAuth(ownerRaceApp);
    otherOwnerAuth = getAuth(otherOwnerApp);
    await Promise.all([
      signInWithEmailAndPassword(secretaryAuth, SECRETARY_EMAIL, process.env.STAGING_TEST_ALPHA_PASSWORD),
      signInWithEmailAndPassword(ownerAuth, ownerEmail, tempPassword),
      signInWithEmailAndPassword(ownerRaceAuth, ownerEmail, tempPassword),
      signInWithEmailAndPassword(otherOwnerAuth, otherOwnerEmail, tempPassword),
    ]);

    const secretaryFunctions = getFunctions(secretaryApp, 'us-central1');
    const ownerFunctions = getFunctions(ownerApp, 'us-central1');
    const ownerRaceFunctions = getFunctions(ownerRaceApp, 'us-central1');
    const otherOwnerFunctions = getFunctions(otherOwnerApp, 'us-central1');
    const quoteCall = httpsCallable(secretaryFunctions, 'getCollectionQuote');
    const payCall = httpsCallable(secretaryFunctions, 'recordCashPayment');
    const secretaryReverseCall = httpsCallable(secretaryFunctions, 'reversePayment');
    const ownerReverseCall = httpsCallable(ownerFunctions, 'reversePayment');
    const ownerRaceReverseCall = httpsCallable(ownerRaceFunctions, 'reversePayment');
    const otherOwnerReverseCall = httpsCallable(otherOwnerFunctions, 'reversePayment');
    const secretaryCloseCall = httpsCallable(secretaryFunctions, 'closeCashDrawer');
    const otherOwnerCloseCall = httpsCallable(otherOwnerFunctions, 'closeCashDrawer');
    const quote = async (studentId, type, extra = {}) => (await quoteCall({
      schoolId: testSchoolId, studentId, academicYear, type, ...extra,
    })).data;
    const pay = async (requestId, studentId, amount, type, extra = {}) => {
      const result = (await payCall({
        schoolId: testSchoolId, studentId, academicYear, requestId, amount, type,
        description: marker, ...extra,
      })).data;
      paymentIds.add(result.paymentId);
      receiptIds.add(result.receiptId);
      targetIds.add(result.paymentId);
      return result;
    };

    console.log('FIXTURES COMPLETE: exact students, benefits, legacy model, deadlines and moratorium');
    const studentDocuments = Object.entries(studentIds).flatMap(([label, id]) => [
      db.collection('students').doc(id).create({
        id, schoolId: testSchoolId, name: `${marker}-${label}`, matricule: `E2E-${label}-${suffix}`.slice(0, 80),
        classId: primaryClassId, academicYearId: activeAcademicYearId, academicYear,
        gender: 'F', section: 'francophone', isActive: true,
        testFixture: true, testRunId: suffix,
      }),
      db.collection('studentFinance').doc(id).create({
        id, studentId: id, schoolId: testSchoolId,
        registrationFeeExpected: 15_000, registrationFeePaid: 0, registrationFeeStatus: 'unpaid',
        feeT1: 70_000, feeT2: 70_000, feeT3: 70_000, transportMonthlyFee: 4_000,
        testFixture: true, testRunId: suffix,
      }),
    ]);
    await Promise.all(studentDocuments);

    referenceId = `e2e-complete-benefit-ref-${suffix}`;
    await Promise.all([
      db.collection('financialBenefits').doc(benefitIds.scholarship).create({
        id: benefitIds.scholarship, schoolId: testSchoolId, studentId: studentIds.main, academicYear,
        requestId: `e2e-complete-scholarship-request-${suffix}`, benefitType: 'SCHOLARSHIP',
        paymentType: 'TUITION', mode: 'FIXED_AMOUNT', value: 10_000, installment: 'T1',
        stackable: true, status: 'approved', usageCount: 0, maximumUses: 1,
        appliedTargets: [], reason: marker, testFixture: true, testRunId: suffix,
      }),
      db.collection('financialBenefits').doc(benefitIds.fixedDiscount).create({
        id: benefitIds.fixedDiscount, schoolId: testSchoolId, studentId: studentIds.main, academicYear,
        requestId: `e2e-complete-fixed-request-${suffix}`, benefitType: 'DISCOUNT_VOUCHER',
        paymentType: 'TUITION', mode: 'FIXED_AMOUNT', value: 5_000, installment: 'T2',
        reference: `E2E-FIXED-${suffix}`.slice(0, 80).toUpperCase(), stackable: true,
        status: 'approved', usageCount: 0, maximumUses: 1, appliedTargets: [],
        reason: marker, testFixture: true, testRunId: suffix,
      }),
      db.collection('financialBenefits').doc(benefitIds.percentage).create({
        id: benefitIds.percentage, schoolId: testSchoolId, studentId: studentIds.percentage, academicYear,
        requestId: `e2e-complete-percentage-request-${suffix}`, benefitType: 'SCHOLARSHIP',
        paymentType: 'TUITION', mode: 'PERCENTAGE', value: 25, installment: 'T3',
        stackable: true, status: 'approved', usageCount: 0, maximumUses: 1,
        appliedTargets: [], reason: marker, testFixture: true, testRunId: suffix,
      }),
      db.collection('financialBenefitReferences').doc(referenceId).create({
        id: referenceId, schoolId: testSchoolId, reference: `E2E-FIXED-${suffix}`.slice(0, 80).toUpperCase(),
        benefitId: benefitIds.fixedDiscount, singleUse: true, maximumUses: 1,
        testFixture: true, testRunId: suffix,
      }),
      db.collection('tuitionDiscounts').doc(legacyDiscountId).create({
        id: legacyDiscountId, schoolId: testSchoolId, studentId: studentIds.legacy, academicYear,
        installment: 'T1', grossExpectedAmount: 70_000, discountAmount: 5_000,
        netExpectedAmount: 65_000, reason: marker, status: 'approved',
        testFixture: true, testRunId: suffix,
      }),
      db.collection('tuitionDiscountSlots').doc(legacySlotId).create({
        id: legacySlotId, schoolId: testSchoolId, studentId: studentIds.legacy, academicYear,
        installment: 'T1', discountId: legacyDiscountId,
        testFixture: true, testRunId: suffix,
      }),
      db.collection('paymentMoratoriums').doc(moratoriumId).create({
        id: moratoriumId, schoolId: testSchoolId, studentId: studentIds.main, academicYear,
        paymentType: 'tuition', installment: 'T1', status: 'approved',
        originalDueDate, effectiveDueDate: moratoriumDueDate, reason: marker,
        testFixture: true, testRunId: suffix,
      }),
    ]);

    console.log('BENEFITS COMPLETE: fixed scholarship, fixed discount, percentage and legacy');
    const mainT1Before = await quote(studentIds.main, 'tuition', { installment: 'T1' });
    assert.deepEqual({
      gross: mainT1Before.grossExpectedAmount, discount: mainT1Before.discountAmount,
      net: mainT1Before.netExpectedAmount, remaining: mainT1Before.remainingBalance,
    }, { gross: 70_000, discount: 10_000, net: 60_000, remaining: 60_000 });
    assert.equal(mainT1Before.originalDueDate, originalDueDate);
    assert.equal(mainT1Before.effectiveDueDate, moratoriumDueDate);
    assert.equal(mainT1Before.moratoriumStatus, 'ACTIVE');
    assert.equal(mainT1Before.overdue, false);
    assert.equal(mainT1Before.nextDueDate, moratoriumDueDate);
    const mainT1Payment = await pay(requestIds.mainT1Partial, studentIds.main, 10_000, 'tuition', { installment: 'T1' });
    assert.equal(mainT1Payment.remainingBalance, 50_000);

    const mainT2 = await quote(studentIds.main, 'tuition', { installment: 'T2' });
    assert.deepEqual({ gross: mainT2.grossExpectedAmount, discount: mainT2.discountAmount,
      net: mainT2.netExpectedAmount, remaining: mainT2.remainingBalance },
    { gross: 70_000, discount: 5_000, net: 65_000, remaining: 65_000 });
    assert.equal(mainT2.originalDueDate, futureDueDate);
    assert.equal(mainT2.overdue, false);
    assert.equal(mainT2.dueStatus, 'NOT_DUE');

    const mainT3 = await quote(studentIds.main, 'tuition', { installment: 'T3' });
    assert.equal(mainT3.remainingBalance, 70_000);
    assert.equal(mainT3.originalDueDate, originalDueDate);
    assert.equal(mainT3.overdue, true);
    assert.equal(mainT3.dueStatus, 'OVERDUE');
    assert.deepEqual({
      gross: mainT1Before.grossExpectedAmount + mainT2.grossExpectedAmount + mainT3.grossExpectedAmount,
      net: mainT1Before.netExpectedAmount + mainT2.netExpectedAmount + mainT3.netExpectedAmount,
      paid: 10_000,
      remaining: mainT1Payment.remainingBalance + mainT2.remainingBalance + mainT3.remainingBalance,
    }, { gross: 210_000, net: 195_000, paid: 10_000, remaining: 185_000 });

    const percentageBefore = await quote(studentIds.percentage, 'tuition', { installment: 'T3' });
    assert.deepEqual({ gross: percentageBefore.grossExpectedAmount, discount: percentageBefore.discountAmount,
      net: percentageBefore.netExpectedAmount, remaining: percentageBefore.remainingBalance },
    { gross: 70_000, discount: 17_500, net: 52_500, remaining: 52_500 });
    const percentagePartial = await pay(
      requestIds.percentagePartial, studentIds.percentage, 10_000, 'tuition', { installment: 'T3' },
    );
    assert.equal(percentagePartial.remainingBalance, 42_500);
    const percentageFull = await pay(
      requestIds.percentageFull, studentIds.percentage, 42_500, 'tuition', { installment: 'T3' },
    );
    assert.equal(percentageFull.remainingBalance, 0);
    const percentagePaid = await quote(studentIds.percentage, 'tuition', { installment: 'T3' });
    assert.equal(percentagePaid.remainingBalance, 0);
    assert.equal(percentagePaid.overdue, false);
    assert.equal(percentagePaid.dueStatus, 'PAID');
    assert.equal(percentagePaid.nextDueDate, null);

    const legacyBefore = await quote(studentIds.legacy, 'tuition', { installment: 'T1' });
    assert.equal(legacyBefore.discountAmount, 5_000);
    assert.equal(legacyBefore.netExpectedAmount, 65_000);
    assert.equal(legacyBefore.benefits.length, 1);
    assert.equal(legacyBefore.benefits[0].benefitId, `legacy:${legacyDiscountId}`);
    const legacyPartial = await pay(
      requestIds.legacyPartial, studentIds.legacy, 10_000, 'tuition', { installment: 'T1' },
    );
    assert.equal(legacyPartial.remainingBalance, 55_000);

    console.log('REVERSAL COMPLETE: owner, denials, idempotence, concurrency and immutable originals');
    const cashA = await pay(requestIds.cashA, studentIds.main, 2_000, 'registration_fee');
    const cashB = await pay(requestIds.cashB, studentIds.main, 3_000, 'registration_fee');
    const beforeDeniedPayments = await db.collection('payments').where('studentId', '==', studentIds.main).get();
    const beforeDeniedReceipts = await db.collection('receipts').where('studentId', '==', studentIds.main).get();
    await expectCallableFailure(
      () => secretaryReverseCall({ paymentId: cashB.paymentId, requestId: requestIds.reverseB, reason: marker }),
      ['PERMISSION_DENIED', 'functions/permission-denied'],
    );
    await expectCallableFailure(
      () => otherOwnerReverseCall({ paymentId: cashB.paymentId, requestId: requestIds.reverseB, reason: marker }),
      ['CROSS_SCHOOL_DENIED', 'functions/permission-denied'],
    );
    assert.equal((await db.collection('payments').where('studentId', '==', studentIds.main).get()).size,
      beforeDeniedPayments.size);
    assert.equal((await db.collection('receipts').where('studentId', '==', studentIds.main).get()).size,
      beforeDeniedReceipts.size);

    const reverseB = (await ownerReverseCall({
      paymentId: cashB.paymentId, requestId: requestIds.reverseB, reason: marker,
    })).data;
    const reverseBReplay = (await ownerReverseCall({
      paymentId: cashB.paymentId, requestId: requestIds.reverseB, reason: marker,
    })).data;
    assert.equal(reverseBReplay.idempotentReplay, true);
    assert.equal(reverseBReplay.reversalId, reverseB.reversalId);
    paymentIds.add(reverseB.reversalId);
    receiptIds.add(reverseB.correctionReceiptId);
    targetIds.add(reverseB.reversalId);
    targetIds.add(cashB.paymentId);
    const originalPaymentB = await db.collection('payments').doc(cashB.paymentId).get();
    const originalReceiptB = await db.collection('receipts').doc(cashB.paymentId).get();
    const reversalB = await db.collection('payments').doc(reverseB.reversalId).get();
    const correctionReceiptB = await db.collection('receipts').doc(reverseB.correctionReceiptId).get();
    assert.equal(originalPaymentB.exists, true);
    assert.equal(originalReceiptB.exists, true);
    assert.equal(reversalB.exists, true);
    assert.equal(correctionReceiptB.exists, true);
    assert.equal(reversalB.data()?.amount, -3_000);

    const cashC = await pay(requestIds.cashC, studentIds.main, 4_000, 'registration_fee');
    const reversalRace = await Promise.allSettled([
      ownerReverseCall({ paymentId: cashC.paymentId, requestId: requestIds.reverseC1, reason: `${marker}-race-1` }),
      ownerRaceReverseCall({ paymentId: cashC.paymentId, requestId: requestIds.reverseC2, reason: `${marker}-race-2` }),
    ]);
    assert.equal(reversalRace.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(reversalRace.filter((item) => item.status === 'rejected').length, 1);
    const fulfilledRace = reversalRace.find((item) => item.status === 'fulfilled').value.data;
    paymentIds.add(fulfilledRace.reversalId);
    receiptIds.add(fulfilledRace.correctionReceiptId);
    targetIds.add(fulfilledRace.reversalId);
    targetIds.add(cashC.paymentId);
    const raceReversals = await db.collection('payments')
      .where('originalPaymentId', '==', cashC.paymentId).get();
    const raceCorrectionReceipts = await db.collection('receipts')
      .where('originalPaymentId', '==', cashC.paymentId).get();
    assert.equal(raceReversals.size, 1);
    assert.equal(raceCorrectionReceipts.size, 1);
    const registrationAfterReversals = await quote(studentIds.main, 'registration_fee');
    assert.equal(registrationAfterReversals.previousPaid, cashA.amount);
    assert.equal(registrationAfterReversals.remainingBalance, 15_000 - cashA.amount);

    const reversalAudits = await db.collection('audit_logs').where('schoolId', '==', testSchoolId).get();
    const exactReversalAudits = reversalAudits.docs.filter((item) => {
      const data = item.data();
      return [cashB.paymentId, reverseB.reversalId, cashC.paymentId, fulfilledRace.reversalId]
        .includes(String(data.targetId || ''));
    });
    assert.ok(exactReversalAudits.some((item) => item.data().action === 'PAYMENT_REVERSED'));
    assert.ok(exactReversalAudits.some((item) => item.data().action === 'PAYMENT_REVERSAL_RECEIPT_CREATED'));

    console.log('RESPONSIVE COMPLETE: real secretary CASH submission at 360, 768 and 1440 pixels');
    const responsiveCases = [
      { width: 360, studentId: studentIds.responsive360, amount: 1_000 },
      { width: 768, studentId: studentIds.responsive768, amount: 2_000 },
      { width: 1440, studentId: studentIds.responsive1440, amount: 3_000 },
    ];
    for (const item of responsiveCases) {
      const context = await browser.newContext({ viewport: { width: item.width, height: 900 }, acceptDownloads: false });
      const page = await context.newPage();
      await page.route(`${appUrl}/**`, async (route) => route.continue({
        headers: {
          ...route.request().headers(),
          'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          'x-vercel-set-bypass-cookie': 'true',
        },
      }));
      page.on('request', (request) => {
        if (classifyFirebaseRequest(request.url()).relevant) firebaseRequestUrls.push(request.url());
      });
      try {
        await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.getByTestId('login-email').fill(SECRETARY_EMAIL);
        await page.getByTestId('login-password').fill(process.env.STAGING_TEST_ALPHA_PASSWORD);
        await page.getByTestId('login-submit').click();
        await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 30_000 });
        await page.goto(`${appUrl}/#/payments`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.getByRole('button', { name: /Encaissement/i }).first().click();
        const form = page.locator('form').filter({
          has: page.getByRole('button', { name: "Enregistrer l'encaissement", exact: true }),
        });
        await page.getByTestId('cash-payment-student').selectOption(item.studentId);
        await form.locator('select').nth(1).selectOption('registration_fee');
        await page.getByTestId('cash-payment-amount').fill(String(item.amount));
        assert.equal(await page.getByTestId('mobile-money-method').count(), 0);
        await page.getByText(/encaissement en espèces uniquement/i).waitFor({ state: 'visible' });
        await page.getByTestId('cash-payment-submit').click();
        await page.getByRole('heading', { name: 'Nouvel Encaissement' })
          .waitFor({ state: 'hidden', timeout: 30_000 });
        const payment = await waitForSinglePayment(db, item.studentId);
        const paymentData = payment.data();
        paymentIds.add(payment.id);
        receiptIds.add(payment.id);
        targetIds.add(payment.id);
        assert.equal(paymentData.amount, item.amount);
        assert.equal(paymentData.method, 'cash');
        const receipt = await db.collection('receipts').doc(payment.id).get();
        assert.equal(receipt.exists, true);
        assert.equal(receipt.data()?.remainingBalance, 15_000 - item.amount);
        await page.getByRole('button', { name: 'Reçus', exact: true }).click();
        await page.getByPlaceholder(/Rechercher reçu/i).fill(`E2E-${Object.entries(studentIds)
          .find(([, id]) => id === item.studentId)[0]}-${suffix}`.slice(0, 80));
        await page.getByText(receipt.data()?.receiptNumber, { exact: true }).waitFor({ timeout: 20_000 });
        assert.ok(await page.getByRole('button', { name: /Imprimer/i }).count() > 0);
        console.log(`RESPONSIVE ${item.width}px FULL PAYMENT FLOW: PASS`);
      } finally {
        await context.close();
      }
    }

    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequestUrls });

    console.log('CASH CLOSURE COMPLETE: signed reversals and cross-school denial');
    const currentDate = doualaDate();
    closureId = `${testSchoolId}__${currentDate}`;
    assert.equal((await db.collection('cashClosures').doc(closureId).get()).exists, false);
    await expectCallableFailure(() => otherOwnerCloseCall({
      schoolId: testSchoolId, academicYear, date: currentDate,
      openingBalance: 0, countedBalance: 0, notes: marker,
    }), ['functions/permission-denied']);
    const todayPayments = await db.collection('payments')
      .where('schoolId', '==', testSchoolId).where('date', '==', currentDate).get();
    const todayExpenses = await db.collection('expenses')
      .where('schoolId', '==', testSchoolId).where('date', '==', currentDate).get();
    const expectedCash = todayPayments.docs.reduce((sum, item) => {
      const data = item.data();
      const status = String(data.status || 'completed').toLowerCase();
      if (String(data.method || 'cash').toLowerCase() !== 'cash'
          || ['pending', 'failed', 'cancelled', 'canceled', 'refunded', 'reversed'].includes(status)) return sum;
      return sum + Number(data.amount || 0);
    }, 0);
    const cashExpenses = todayExpenses.docs.reduce((sum, item) => sum + Number(item.data().amount || 0), 0);
    const openingBalance = Math.max(0, cashExpenses - expectedCash);
    const countedBalance = openingBalance + expectedCash - cashExpenses;
    const closure = (await secretaryCloseCall({
      schoolId: testSchoolId, academicYear, date: currentDate,
      openingBalance, countedBalance, notes: marker,
    })).data;
    assert.equal(closure.closureId, closureId);
    const closureSnapshot = await db.collection('cashClosures').doc(closureId).get();
    assert.equal(closureSnapshot.exists, true);
    assert.equal(closureSnapshot.data()?.cashReceived, expectedCash);
    assert.equal(closureSnapshot.data()?.countedBalance, countedBalance);
    assert.equal(closureSnapshot.data()?.closedBy, secretaryUid);
    await expectCallableFailure(() => secretaryCloseCall({
      schoolId: testSchoolId, academicYear, date: currentDate,
      openingBalance, countedBalance, notes: marker,
    }), ['functions/already-exists']);
    console.log(`CASH CLOSURE EXPECTED: ${expectedCash}`);
    console.log(`CASH CLOSURE ACTUAL: ${closureSnapshot.data()?.cashReceived}`);

    console.log('STAGING COLLECTIONS COMPLETION E2E: PASS');
  } finally {
    console.log('CLEANUP COMPLETE: deleting only exact completion fixtures');
    let cleanupError = null;
    try {
      await Promise.all([
        secretaryAuth?.currentUser ? signOut(secretaryAuth) : Promise.resolve(),
        ownerAuth?.currentUser ? signOut(ownerAuth) : Promise.resolve(),
        ownerRaceAuth?.currentUser ? signOut(ownerRaceAuth) : Promise.resolve(),
        otherOwnerAuth?.currentUser ? signOut(otherOwnerAuth) : Promise.resolve(),
      ]);

      const taggedCollections = [
        'payments', 'receipts', 'financialBenefits', 'financialBenefitReferences',
        'paymentMoratoriums', 'tuitionDiscounts', 'tuitionDiscountSlots',
        'students', 'studentFinance', 'users',
      ];
      const taggedSnapshots = [];
      for (const name of taggedCollections) {
        taggedSnapshots.push(await db.collection(name).where('testRunId', '==', suffix).get());
      }
      taggedSnapshots.forEach((snapshot) => snapshot.docs.forEach((item) => targetIds.add(item.id)));

      const auditSnapshot = testSchoolId
        ? await db.collection('audit_logs').where('schoolId', '==', testSchoolId).get()
        : { docs: [] };
      const exactAudits = auditSnapshot.docs.filter((item) => {
        const data = item.data();
        return targetIds.has(String(data.targetId || ''))
          || Object.values(studentIds).includes(String(data.targetId || ''))
          || String(data.targetName || '').includes(marker);
      });
      await deleteSnapshots(db, exactAudits);
      await deleteSnapshots(db, taggedSnapshots);

      if (closureId) {
        const closureRef = db.collection('cashClosures').doc(closureId);
        const snapshot = await closureRef.get();
        if (snapshot.exists) {
          assert.equal(snapshot.data()?.notes, marker);
          assert.equal(snapshot.data()?.schoolId, testSchoolId);
          await closureRef.delete();
        }
      }

      if (testSchoolId && schoolBefore && deadlineFixture && paymentSettingsFixture) {
        const schoolRef = db.collection('schools').doc(testSchoolId);
        await db.runTransaction(async (transaction) => {
          const current = await transaction.get(schoolRef);
          const currentData = current.data() || {};
          assert.equal(currentData.e2ePaymentsLiveConfig?.testRunId, suffix,
            'Refusing to restore a staging school configuration owned by another operation.');
          assert.equal(stableStringify(currentData.paymentDeadlines), stableStringify(deadlineFixture));
          assert.equal(stableStringify(currentData.paymentSettings), stableStringify(paymentSettingsFixture));
          const patch = {
            paymentDeadlines: schoolBefore.paymentDeadlines ?? FieldValue.delete(),
            paymentSettings: schoolBefore.paymentSettings ?? FieldValue.delete(),
            e2ePaymentsLiveConfig: FieldValue.delete(),
          };
          transaction.update(schoolRef, patch);
        });
      }

      for (const uid of createdAuthUids) {
        try {
          await adminAuth.deleteUser(uid);
        } catch (error) {
          if (error?.code !== 'auth/user-not-found') throw error;
        }
      }

      const remaining = {};
      for (const name of taggedCollections) {
        remaining[name] = (await db.collection(name).where('testRunId', '==', suffix).get()).size;
      }
      assert.deepEqual(remaining, Object.fromEntries(taggedCollections.map((name) => [name, 0])));
      if (testSchoolId) {
        const schoolAfter = (await db.collection('schools').doc(testSchoolId).get()).data() || {};
        assert.equal(schoolAfter.e2ePaymentsLiveConfig, undefined);
        assert.equal(stableStringify(schoolAfter.paymentDeadlines), stableStringify(schoolBefore.paymentDeadlines));
        assert.equal(stableStringify(schoolAfter.paymentSettings), stableStringify(schoolBefore.paymentSettings));
      }
      if (closureId) assert.equal((await db.collection('cashClosures').doc(closureId).get()).exists, false);
      for (const uid of createdAuthUids) {
        await assert.rejects(() => adminAuth.getUser(uid), (error) => error?.code === 'auth/user-not-found');
      }
      const postAuditSnapshot = testSchoolId
        ? await db.collection('audit_logs').where('schoolId', '==', testSchoolId).get()
        : { docs: [] };
      assert.equal(postAuditSnapshot.docs.filter((item) => {
        const data = item.data();
        return targetIds.has(String(data.targetId || ''))
          || Object.values(studentIds).includes(String(data.targetId || ''))
          || String(data.targetName || '').includes(marker);
      }).length, 0);
      console.log('STAGING COMPLETION FIXTURE CLEANUP: PASS');
      console.log('STAGING COMPLETION RESIDUALS: 0');
      console.log('STAGING COMPLETION ORPHANS: 0');
      console.log('RECEIPT COUNTER REWOUND: NO');
    } catch (error) {
      cleanupError = error;
      console.error(`STAGING COMPLETION FIXTURE CLEANUP: FAIL ${redactSecrets(error?.message)}`);
    } finally {
      await precheckContext.close();
      await browser.close();
      for (const app of [secretaryApp, ownerApp, ownerRaceApp, otherOwnerApp]) {
        if (app) await deleteApp(app);
      }
      await deleteAdminApp(adminApp);
    }
    if (cleanupError) throw cleanupError;
  }
};

run().catch((error) => {
  const code = error?.code || 'UNKNOWN';
  const details = businessCode(error) || 'NO_BUSINESS_CODE';
  console.error(`STAGING COLLECTIONS COMPLETION E2E: FAIL (${code} / ${details}) ${redactSecrets(error?.message)}`);
  process.exitCode = 1;
});
