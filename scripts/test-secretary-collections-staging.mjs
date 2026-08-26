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
  if (process.env.STAGING_FIREBASE_PROJECT_ID !== EXPECTED_PROJECT) {
    throw new Error('Refusing to run: the configured Firebase project is not staging.');
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
      expectedCodes.includes(businessCode(error)),
      `Unexpected callable error (${error?.code || 'unknown'} / ${businessCode(error) || 'no-business-code'})`,
    );
  }
};

const hashId = (prefix, values) => `${prefix}_${crypto
  .createHash('sha256').update(JSON.stringify(values), 'utf8').digest('hex')}`;

const doualaDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const deleteSnapshots = async (db, snapshots) => {
  const refs = snapshots.flatMap((snapshot) => snapshot.docs || [snapshot])
    .filter((snapshot) => snapshot?.exists !== false)
    .map((snapshot) => snapshot.ref)
    .filter(Boolean);
  while (refs.length) {
    const batch = db.batch();
    refs.splice(0, 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

const run = async () => {
  const appUrl = requireEnvironment();
  const runToken = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '1').replace(/[^A-Za-z0-9_-]/g, '-');
  const suffix = `${runToken}-${attempt}`;
  const studentId = `e2e-collections-student-${suffix}`;
  const studentName = `Élève fictif Encaissements ${suffix}`;
  const matricule = `E2E-COL-${suffix}`.slice(0, 80);
  const tuitionBenefitId = `e2e-benefit-tuition-${suffix}`;
  const transportBenefitId = `e2e-benefit-transport-${suffix}`;
  const draftBenefitId = `e2e-benefit-draft-${suffix}`;
  const voucherReference = `E2E-BON-${suffix}`.slice(0, 80).toUpperCase();
  let referenceId = null;
  const requestIds = {
    tuitionPartial: `e2e-tuition-partial-${suffix}`,
    tuitionFull: `e2e-tuition-full-${suffix}`,
    tuitionOver: `e2e-tuition-over-${suffix}`,
    transportPartial: `e2e-transport-partial-${suffix}`,
    transportFull: `e2e-transport-full-${suffix}`,
    transportOver: `e2e-transport-over-${suffix}`,
    concurrentA: `e2e-concurrency-a-${suffix}`,
    concurrentB: `e2e-concurrency-b-${suffix}`,
    secondaryTransport: `e2e-secondary-transport-${suffix}`,
  };

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT);
  } catch {
    throw new Error('STAGING_FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
  }
  if (serviceAccount.project_id !== EXPECTED_PROJECT) {
    throw new Error('Refusing to run: the service account does not target staging.');
  }

  const adminApp = initializeAdminApp({ credential: cert(serviceAccount) }, `collections-e2e-${suffix}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: false,
    recordVideo: undefined,
  });
  const page = await context.newPage();
  await page.route(`${appUrl}/**`, async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        'x-vercel-set-bypass-cookie': 'true',
      },
    });
  });
  const firebaseRequestUrls = [];
  page.on('request', (request) => {
    if (classifyFirebaseRequest(request.url()).relevant) firebaseRequestUrls.push(request.url());
  });

  let clientApp;
  let clientAuth;
  let closureId = null;
  let secretaryUid = null;
  let testSchoolId = null;
  let primaryClassId = null;
  let secondaryClassId = null;
  let matriculeReservationId = null;
  let duplicateReservationId = null;
  let schoolStudentsCountBefore = null;
  let schoolBeforeData = null;
  let schoolActiveAcademicYearIdBefore = null;
  let academicYearFixtureId = null;
  let secondaryClassFixtureId = null;
  let mobileMoneyExpected = false;
  let schoolTransportPolicyBefore;
  let schoolPaymentDeadlinesBefore;
  let schoolTransportPolicyConfigured = false;
  const transportFixtureStudentIds = new Set();
  const paymentIds = new Set();
  const receiptNumbers = new Set();
  const targetIds = new Set([studentId, tuitionBenefitId, transportBenefitId, draftBenefitId]);

  try {
    console.log('PRECHECK: staging target and secretary authentication');
    const stagingRequest = page.waitForRequest(
      (request) => classifyFirebaseRequest(request.url()).staging,
      { timeout: 30_000 },
    );
    await page.goto(`${appUrl}/#/diagnostic`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: page.url() });
    await page.getByRole('heading', { name: /Outil de Diagnostic et Preuves d.Audit/ })
      .waitFor({ state: 'visible', timeout: 30_000 });
    const runtimeProjectElement = page.getByTestId('diagnostic-firebase-project');
    await runtimeProjectElement.waitFor({ state: 'visible', timeout: 30_000 });
    const runtimeProject = (await runtimeProjectElement.textContent())?.trim() || '';
    assertStagingRuntimeProject(runtimeProject);
    const networkProbeUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(runtimeProject)}/databases/(default)/documents/__e2e_precheck__/network-probe`;
    await page.evaluate(async (url) => {
      await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
      }).catch(() => undefined);
    }, networkProbeUrl);
    await stagingRequest;
    const isolation = assertStagingFirebasePrecheck({
      runtimeProject,
      requestUrls: firebaseRequestUrls,
    });
    console.log(
      `PRECHECK: runtime=${isolation.runtimeProject}, staging requests=${isolation.stagingRequests}, production requests=0`,
    );

    await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email').fill(SECRETARY_EMAIL);
    await page.getByTestId('login-password').fill(process.env.STAGING_TEST_ALPHA_PASSWORD);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 20_000 });
    await page.goto(`${appUrl}/#/payments`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Comptabilité Générale/i }).waitFor({ timeout: 20_000 });
    await page.getByRole('button', { name: /Encaissement/i }).first().waitFor({ timeout: 20_000 });
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequestUrls });

    const secretaryAccount = await adminAuth.getUserByEmail(SECRETARY_EMAIL);
    secretaryUid = secretaryAccount.uid;
    const secretarySnapshot = await db.collection('users').doc(secretaryUid).get();
    assert.equal(secretarySnapshot.exists, true);
    const secretary = secretarySnapshot.data() || {};
    assert.equal(secretary.role, 'secretary');
    testSchoolId = String(secretary.schoolId || '').trim();
    assert.ok(testSchoolId, 'The staging secretary has no schoolId.');
    assert.equal(secretary.active === true || secretary.isActive === true, true);
    referenceId = hashId('benefitref', [testSchoolId, voucherReference]);

    const schoolSnapshot = await db.collection('schools').doc(testSchoolId).get();
    assert.equal(schoolSnapshot.exists, true);
    const school = schoolSnapshot.data() || {};
    mobileMoneyExpected = ['campay', 'flutterwave'].includes(school.paymentSettings?.activeProvider);
    schoolBeforeData = school;
    schoolActiveAcademicYearIdBefore = typeof school.activeAcademicYearId === 'string'
      && school.activeAcademicYearId && !school.activeAcademicYearId.includes('/')
      ? school.activeAcademicYearId : null;
    let activeAcademicYearId = schoolActiveAcademicYearIdBefore;
    if (!activeAcademicYearId) {
      assert.match(String(school.academicYear || ''), /^\d{4}-\d{4}$/,
        'The staging school has neither a canonical pointer nor a valid legacy year label.');
      academicYearFixtureId = `e2e-academic-year-${suffix}`;
      const fixtureYearRef = db.collection('academicYears').doc(academicYearFixtureId);
      assert.equal((await fixtureYearRef.get()).exists, false,
        'The exact academic year fixture ID already exists.');
      await fixtureYearRef.create({
        id: academicYearFixtureId, schoolId: testSchoolId, name: school.academicYear,
        status: 'active', testFixture: true, testRunId: suffix, createdAt: FieldValue.serverTimestamp(),
      });
      await db.collection('schools').doc(testSchoolId).update({ activeAcademicYearId: academicYearFixtureId });
      activeAcademicYearId = academicYearFixtureId;
    }
    const academicYearSnapshot = await db.collection('academicYears').doc(activeAcademicYearId).get();
    assert.equal(academicYearSnapshot.exists, true, 'The staging active academic year document is missing.');
    const academicYearData = academicYearSnapshot.data() || {};
    assert.equal(academicYearData.schoolId, testSchoolId);
    assert.equal(academicYearData.status, 'active');
    assert.match(String(academicYearData.name || ''), /^\d{4}-\d{4}$/);
    const academicYear = String(academicYearData.name);
    const [startYear, endYear] = academicYear.split('-').map(Number);
    assert.equal(endYear, startYear + 1);
    const september = `${startYear}-09`;
    const october = `${startYear}-10`;
    const november = `${startYear}-11`;
    const classSnapshot = await db.collection('classes').where('schoolId', '==', testSchoolId).get();
    assert.equal(classSnapshot.empty, false, 'No same-school staging class is available for the fixture.');
    const structuredCycle = (data) => String(data.cycle || data.level || '').toLowerCase();
    const primaryClass = classSnapshot.docs.find((item) => {
      const data = item.data();
      return data.isActive !== false && (
        ['primary', 'primaire'].includes(structuredCycle(data))
        || ['SIL', 'CP', 'CE1', 'CE2', 'CM1'].includes(String(data.name))
      );
    });
    const secondaryClass = classSnapshot.docs.find((item) => {
      const data = item.data();
      return data.isActive !== false && (
        ['secondary', 'secondaire'].includes(structuredCycle(data))
        || /^(6e|5e|4e|3e|Form [1-4])$/.test(String(data.name))
      );
    });
    assert.ok(primaryClass, 'No canonical primary staging class is available for the fixture.');
    primaryClassId = primaryClass.id;
    if (secondaryClass) {
      secondaryClassId = secondaryClass.id;
    } else {
      secondaryClassFixtureId = `e2e-secondary-class-${suffix}`;
      const secondaryClassRef = db.collection('classes').doc(secondaryClassFixtureId);
      assert.equal((await secondaryClassRef.get()).exists, false,
        'The exact secondary class fixture ID already exists.');
      await secondaryClassRef.create({
        id: secondaryClassFixtureId, schoolId: testSchoolId, name: '6e', section: 'francophone',
        cycle: 'secondary', isActive: true, testFixture: true, testRunId: suffix,
        createdAt: FieldValue.serverTimestamp(),
      });
      secondaryClassId = secondaryClassFixtureId;
    }
    schoolStudentsCountBefore = school.studentsCount;
    assert.ok(Number.isSafeInteger(schoolStudentsCountBefore), 'The staging student counter is not initialized.');
    const today = doualaDate();
    const expectedClosureId = `${testSchoolId}__${today}`;
    assert.equal((await db.collection('cashClosures').doc(expectedClosureId).get()).exists, false,
      'A staging cash closure already exists for today; refusing to overwrite it.');
    schoolTransportPolicyBefore = school.transportPolicy;
    schoolPaymentDeadlinesBefore = school.paymentDeadlines;
    await db.collection('schools').doc(testSchoolId).update({
      transportPolicy: {
        ...(school.transportPolicy || {}),
        feePolicyId: 'ITALO_PK_2026',
        billingPeriods: [september, october, november],
      },
      paymentDeadlines: {
        ...(school.paymentDeadlines || {}),
        transport: {
          ...(school.paymentDeadlines?.transport || {}),
          [september]: `${startYear}-09-10`,
          [october]: `${startYear}-10-10`,
          [november]: `${startYear}-11-10`,
        },
      },
    });
    schoolTransportPolicyConfigured = true;

    clientApp = initializeApp({
      apiKey: process.env.STAGING_FIREBASE_API_KEY,
      authDomain: process.env.STAGING_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
      storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.STAGING_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.STAGING_FIREBASE_APP_ID,
    }, `collections-client-${suffix}`);
    clientAuth = getAuth(clientApp);
    const credential = await signInWithEmailAndPassword(
      clientAuth, SECRETARY_EMAIL, process.env.STAGING_TEST_ALPHA_PASSWORD,
    );
    assert.equal(credential.user.uid, secretaryUid);
    const functions = getFunctions(clientApp, 'us-central1');
    const createStudentCall = httpsCallable(functions, 'createStudentSecure');
    const quoteCall = httpsCallable(functions, 'getCollectionQuote');
    const payCall = httpsCallable(functions, 'recordCashPayment');
    const approveCall = httpsCallable(functions, 'approveFinancialBenefit');
    const closeCall = httpsCallable(functions, 'closeCashDrawer');

    console.log('FIXTURES: creating the fictitious student through createStudentSecure');
    const primaryClassData = primaryClass.data();
    const section = ['francophone', 'anglophone'].includes(primaryClassData.section)
      ? primaryClassData.section : 'francophone';
    const creation = (await createStudentCall({
      studentId,
      requestedMatricule: matricule,
      studentData: {
        name: studentName, studentLastName: `E2E-${suffix}`, studentFirstName: 'Collections',
        gender: 'F', section, classId: primaryClassId, studentStatus: 'nouveau',
        usesTransport: true,
      },
      privateData: {
        dob: '2017-01-02', parentName: `Parent E2E ${suffix}`, parentPhone: '600000001', transportZonePk: 14,
      },
      financeData: {
        registrationFeeExpected: 15_000, feeT1: 70_000, feeT2: 70_000, feeT3: 70_000,
      },
      parentPrivateData: { dob: '2017-01-02' },
      parentFinanceData: { feeT1: 70_000, feeT2: 70_000, feeT3: 70_000 },
    })).data;
    assert.equal(creation.studentId, studentId);
    assert.equal(creation.academicYearId, activeAcademicYearId);
    const createdStudent = await db.collection('students').doc(studentId).get();
    assert.equal(createdStudent.exists, true);
    await Promise.all([
      'students', 'studentPrivate', 'studentFinance', 'studentParentPrivate', 'studentParentFinance',
    ].map((name) => db.collection(name).doc(studentId).update({ testFixture: true, testRunId: suffix })));
    matriculeReservationId = createdStudent.data()?.matriculeReservationId;
    duplicateReservationId = createdStudent.data()?.duplicateReservationId;
    assert.ok(matriculeReservationId && duplicateReservationId);

    console.log('FIXTURES: creating exact fictitious staging benefit records');
    const now = FieldValue.serverTimestamp();
    await Promise.all([
      db.collection('financialBenefits').doc(tuitionBenefitId).create({
        id: tuitionBenefitId, schoolId: testSchoolId, studentId, academicYear,
        requestId: `e2e-benefit-tuition-${suffix}`, benefitType: 'SCHOLARSHIP',
        paymentType: 'TUITION', mode: 'FIXED_AMOUNT', value: 10_000, installment: 'T1',
        stackable: true, reason: 'Bourse fictive E2E staging', status: 'approved',
        usageCount: 0, maximumUses: 1, appliedTargets: [], createdBy: 'e2e-admin',
        approvedBy: 'e2e-admin', createdAt: now, approvedAt: now, testFixture: true, testRunId: suffix,
      }),
      db.collection('financialBenefits').doc(transportBenefitId).create({
        id: transportBenefitId, schoolId: testSchoolId, studentId, academicYear,
        requestId: `e2e-benefit-transport-${suffix}`, benefitType: 'DISCOUNT_VOUCHER',
        paymentType: 'TRANSPORT', mode: 'FIXED_AMOUNT', value: 1_000,
        transportStartPeriod: september, transportEndPeriod: september,
        reference: voucherReference, singleUse: true, maximumUses: 1,
        stackable: true, reason: 'Bon fictif transport E2E staging', status: 'approved',
        usageCount: 0, appliedTargets: [], createdBy: 'e2e-admin', approvedBy: 'e2e-admin',
        createdAt: now, approvedAt: now, testFixture: true, testRunId: suffix,
      }),
      db.collection('financialBenefits').doc(draftBenefitId).create({
        id: draftBenefitId, schoolId: testSchoolId, studentId, academicYear,
        requestId: `e2e-benefit-draft-${suffix}`, benefitType: 'EXCEPTIONAL_DISCOUNT',
        paymentType: 'TUITION', mode: 'FIXED_AMOUNT', value: 500, installment: 'T3',
        stackable: true, reason: 'Remise fictive non approuvée', status: 'draft',
        usageCount: 0, maximumUses: 1, appliedTargets: [], createdBy: 'e2e-admin',
        createdAt: now, testFixture: true, testRunId: suffix,
      }),
      db.collection('financialBenefitReferences').doc(referenceId).create({
        id: referenceId, schoolId: testSchoolId, reference: voucherReference,
        benefitId: transportBenefitId, singleUse: true, maximumUses: 1,
        createdAt: now, createdBy: 'e2e-admin', testFixture: true, testRunId: suffix,
      }),
    ]);
    const quote = async (type, extra = {}) => (await quoteCall({
      schoolId: testSchoolId, studentId, academicYear, type, ...extra,
    })).data;
    const pay = async (requestId, amount, type, extra = {}) => {
      const result = (await payCall({
        schoolId: testSchoolId, studentId, academicYear, requestId, amount, type, ...extra,
      })).data;
      paymentIds.add(result.paymentId);
      targetIds.add(result.paymentId);
      receiptNumbers.add(result.receiptNumber);
      return result;
    };

    console.log('TUITION: partial, full, benefit, idempotency and overpayment');
    await expectCallableFailure(() => approveCall({ benefitId: draftBenefitId }), ['PERMISSION_DENIED']);
    const tuitionInitial = await quote('tuition', { installment: 'T1' });
    assert.deepEqual({
      gross: tuitionInitial.grossExpectedAmount,
      discount: tuitionInitial.discountAmount,
      net: tuitionInitial.netExpectedAmount,
      paid: tuitionInitial.previousPaid,
      remaining: tuitionInitial.remainingBalance,
    }, { gross: 70_000, discount: 10_000, net: 60_000, paid: 0, remaining: 60_000 });
    const tuitionPartial = await pay(requestIds.tuitionPartial, 30_000, 'tuition', { installment: 'T1' });
    assert.equal(tuitionPartial.remainingBalance, 30_000);
    const tuitionReplay = await pay(requestIds.tuitionPartial, 30_000, 'tuition', { installment: 'T1' });
    assert.equal(tuitionReplay.idempotentReplay, true);
    assert.equal(tuitionReplay.paymentId, tuitionPartial.paymentId);
    const tuitionFull = await pay(requestIds.tuitionFull, 30_000, 'tuition', { installment: 'T1' });
    assert.equal(tuitionFull.remainingBalance, 0);
    await expectCallableFailure(
      () => pay(requestIds.tuitionOver, 1_000, 'tuition', { installment: 'T1' }),
      ['NO_REMAINING_BALANCE', 'OVERPAYMENT_DENIED'],
    );
    assert.equal((await quote('tuition', { installment: 'T2' })).discountAmount, 0);
    assert.equal((await quote('tuition', { installment: 'T3' })).discountAmount, 0);

    console.log('TRANSPORT: monthly isolation, partial, full and overpayment');
    const transportInitial = await quote('transport', { period: september });
    assert.deepEqual({
      gross: transportInitial.grossExpectedAmount,
      discount: transportInitial.discountAmount,
      net: transportInitial.netExpectedAmount,
      remaining: transportInitial.remainingBalance,
    }, { gross: 4_000, discount: 1_000, net: 3_000, remaining: 3_000 });
    const transportPartial = await pay(requestIds.transportPartial, 2_000, 'transport', { period: september });
    assert.equal(transportPartial.remainingBalance, 1_000);
    const transportFull = await pay(requestIds.transportFull, 1_000, 'transport', { period: september });
    assert.equal(transportFull.remainingBalance, 0);
    await expectCallableFailure(
      () => pay(requestIds.transportOver, 1_000, 'transport', { period: september }),
      ['NO_REMAINING_BALANCE', 'OVERPAYMENT_DENIED'],
    );
    const octoberQuote = await quote('transport', { period: october });
    assert.equal(octoberQuote.grossExpectedAmount, 4_000);
    assert.equal(octoberQuote.discountAmount, 0);
    assert.equal(octoberQuote.remainingBalance, 4_000);

    const createTransportFixture = async (label, zonePk, options = {}) => {
      const id = `e2e-transport-${label}-${suffix}`;
      transportFixtureStudentIds.add(id);
      targetIds.add(id);
      const fixtureClassId = options.classId || primaryClassId;
      await Promise.all([
        db.collection('students').doc(id).create({
          id, schoolId: testSchoolId, name: `Transport ${label} ${suffix}`,
          matricule: `E2E-TR-${label}-${suffix}`.slice(0, 80), classId: fixtureClassId,
          academicYearId: activeAcademicYearId, academicYear, gender: 'F', section,
          usesTransport: options.usesTransport !== false, testFixture: true, testRunId: suffix,
        }),
        db.collection('studentPrivate').doc(id).create({
          id, studentId: id, schoolId: testSchoolId, transportZonePk: zonePk,
          testFixture: true, testRunId: suffix,
        }),
        db.collection('studentFinance').doc(id).create({
          id, studentId: id, schoolId: testSchoolId,
          feeT1: 70_000, feeT2: 70_000, feeT3: 70_000,
          testFixture: true, testRunId: suffix,
        }),
      ]);
      return id;
    };
    const quoteFor = (targetStudentId) => quote('transport', { studentId: targetStudentId });
    const payFor = (targetStudentId, requestId, amount) => pay(
      requestId, amount, 'transport', { studentId: targetStudentId },
    );

    console.log('TRANSPORT CANONICAL: PK boundaries and deterministic allocations');
    const pk14 = await createTransportFixture('pk14-allocation', 14);
    const pk33 = await createTransportFixture('pk33-credit', 33);
    const pk34 = await createTransportFixture('pk34-allocation', 34);
    const pk42 = await createTransportFixture('pk42-partial', 42);
    assert.equal((await quoteFor(pk14)).monthlyGrossAmount, 4_000);
    assert.equal((await quoteFor(pk33)).monthlyGrossAmount, 4_000);
    assert.equal((await quoteFor(pk34)).monthlyGrossAmount, 5_000);
    assert.equal((await quoteFor(pk42)).monthlyGrossAmount, 5_000);

    const pk14Payment = await payFor(pk14, `e2e-transport-pk14-${suffix}`, 10_000);
    assert.deepEqual(pk14Payment.allocations, [
      { kind: 'INSTALLMENT', period: september, amount: 4_000 },
      { kind: 'INSTALLMENT', period: october, amount: 4_000 },
      { kind: 'INSTALLMENT', period: november, amount: 2_000 },
    ]);
    assert.equal(pk14Payment.remainingBalance, 2_000);
    const pk14Replay = await payFor(pk14, `e2e-transport-pk14-${suffix}`, 10_000);
    assert.equal(pk14Replay.idempotentReplay, true);
    assert.deepEqual(pk14Replay.allocations, pk14Payment.allocations);
    assert.equal((await db.collection('transportPaymentAllocations')
      .where('paymentId', '==', pk14Payment.paymentId).get()).size, 3);

    const pk34Payment = await payFor(pk34, `e2e-transport-pk34-${suffix}`, 10_000);
    assert.deepEqual(pk34Payment.allocations, [
      { kind: 'INSTALLMENT', period: september, amount: 5_000 },
      { kind: 'INSTALLMENT', period: october, amount: 5_000 },
    ]);
    const partialPayment = await payFor(pk42, `e2e-transport-pk42-${suffix}`, 2_000);
    assert.equal(partialPayment.allocations[0].amount, 2_000);
    assert.equal((await quoteFor(pk42)).installments[0].remainingBalance, 3_000);
    await payFor(pk33, `e2e-transport-credit-prior-${suffix}`, 4_000);
    const creditPayment = await payFor(pk33, `e2e-transport-credit-${suffix}`, 10_000);
    assert.deepEqual(creditPayment.allocations, [
      { kind: 'INSTALLMENT', period: october, amount: 4_000 },
      { kind: 'INSTALLMENT', period: november, amount: 4_000 },
      { kind: 'CREDIT', period: null, amount: 2_000 },
    ]);
    assert.equal(creditPayment.transportCredit, 2_000);
    assert.equal((await quote('tuition', { studentId: pk33, installment: 'T1' })).previousPaid, 0);

    console.log('TRANSPORT CANONICAL: benefits, scope and moratorium');
    const benefitStudent = await createTransportFixture('benefits', 34);
    const fixedBenefitId = `e2e-transport-benefit-fixed-${suffix}`;
    const percentBenefitId = `e2e-transport-benefit-percent-${suffix}`;
    const wrongScopeId = `e2e-transport-benefit-wrong-scope-${suffix}`;
    targetIds.add(fixedBenefitId); targetIds.add(percentBenefitId); targetIds.add(wrongScopeId);
    await Promise.all([
      db.collection('financialBenefits').doc(fixedBenefitId).create({
        id: fixedBenefitId, schoolId: testSchoolId, studentId: benefitStudent, academicYear,
        benefitType: 'SCHOLARSHIP', paymentType: 'TRANSPORT', mode: 'FIXED_AMOUNT', value: 1_000,
        transportStartPeriod: september, transportEndPeriod: september, status: 'approved',
        stackable: true, usageCount: 0, maximumUses: 1, appliedTargets: [],
        createdBy: 'e2e-admin', approvedBy: 'e2e-admin', testFixture: true, testRunId: suffix,
      }),
      db.collection('financialBenefits').doc(percentBenefitId).create({
        id: percentBenefitId, schoolId: testSchoolId, studentId: benefitStudent, academicYear,
        benefitType: 'DISCOUNT_VOUCHER', paymentType: 'TRANSPORT', mode: 'PERCENTAGE', value: 50,
        transportStartPeriod: october, transportEndPeriod: october, status: 'approved',
        stackable: true, usageCount: 0, maximumUses: 1, appliedTargets: [], reference: `E2E-50-${suffix}`,
        createdBy: 'e2e-admin', approvedBy: 'e2e-admin', testFixture: true, testRunId: suffix,
      }),
      db.collection('financialBenefits').doc(wrongScopeId).create({
        id: wrongScopeId, schoolId: testSchoolId, studentId: benefitStudent, academicYear,
        benefitType: 'SCHOLARSHIP', paymentType: 'TUITION', mode: 'FIXED_AMOUNT', value: 2_000,
        installment: 'T1', status: 'approved', stackable: true, usageCount: 0, maximumUses: 1,
        appliedTargets: [], createdBy: 'e2e-admin', approvedBy: 'e2e-admin',
        testFixture: true, testRunId: suffix,
      }),
    ]);
    const benefitQuote = await quoteFor(benefitStudent);
    assert.deepEqual(benefitQuote.installments.slice(0, 2).map((item) => ({
      gross: item.grossExpectedAmount, discount: item.discountAmount, net: item.netExpectedAmount,
    })), [
      { gross: 5_000, discount: 1_000, net: 4_000 },
      { gross: 5_000, discount: 2_500, net: 2_500 },
    ]);
    const moratoriumId = `e2e-transport-moratorium-${suffix}`;
    targetIds.add(moratoriumId);
    await db.collection('paymentMoratoriums').doc(moratoriumId).create({
      id: moratoriumId, schoolId: testSchoolId, studentId: pk42, academicYear,
      paymentType: 'transport', period: october, status: 'approved',
      effectiveDueDate: `${endYear}-12-31`, reason: 'Moratoire transport fixture',
      testFixture: true, testRunId: suffix,
    });
    const moratoriumMonth = (await quoteFor(pk42)).installments.find((item) => item.period === october);
    assert.equal(moratoriumMonth.grossExpectedAmount, 5_000);
    assert.equal(moratoriumMonth.netExpectedAmount, 5_000);
    assert.equal(moratoriumMonth.originalDueDate, `${startYear}-10-10`);
    assert.equal(moratoriumMonth.effectiveDueDate, `${endYear}-12-31`);
    assert.equal(moratoriumMonth.overdue, false);

    console.log('TRANSPORT CANONICAL: free secondary and no false debt');
    const secondaryStudent = await createTransportFixture('secondary-free', 14, { classId: secondaryClassId });
    const secondaryQuote = await quoteFor(secondaryStudent);
    assert.equal(secondaryQuote.transportState, 'FREE_SECONDARY');
    assert.equal(secondaryQuote.monthlyGrossAmount, 0);
    assert.equal(secondaryQuote.remainingBalance, 0);
    await expectCallableFailure(
      () => payFor(secondaryStudent, requestIds.secondaryTransport, 1_000),
      ['TRANSPORT_FREE_SECONDARY'],
    );

    console.log('CONCURRENCY: simultaneous payments cannot overpay');
    const concurrentResults = await Promise.allSettled([
      pay(requestIds.concurrentA, 50_000, 'tuition', { installment: 'T2' }),
      pay(requestIds.concurrentB, 50_000, 'tuition', { installment: 'T2' }),
    ]);
    assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(concurrentResults.filter((result) => result.status === 'rejected').length, 1);
    assert.equal((await quote('tuition', { installment: 'T2' })).previousPaid, 50_000);
    const concurrentTransportStudent = await createTransportFixture('concurrent', 20);
    const transportConcurrency = await Promise.all([
      payFor(concurrentTransportStudent, `e2e-transport-concurrent-a-${suffix}`, 4_000),
      payFor(concurrentTransportStudent, `e2e-transport-concurrent-b-${suffix}`, 4_000),
    ]);
    assert.equal(transportConcurrency.length, 2);
    const concurrentTransportQuote = await quoteFor(concurrentTransportStudent);
    assert.deepEqual(concurrentTransportQuote.installments.map((item) => item.previousPaid), [4_000, 4_000, 0]);

    console.log('RECEIPTS, PROJECTIONS, PRIVACY AND CASH CLOSURE');
    const payments = await db.collection('payments').where('studentId', '==', studentId).get();
    const receipts = await db.collection('receipts').where('studentId', '==', studentId).get();
    assert.equal(payments.size, 5);
    assert.equal(receipts.size, 5);
    assert.ok(paymentIds.size >= 12);
    assert.equal(receiptNumbers.size, paymentIds.size);
    assert.equal(new Set(receipts.docs.map((doc) => doc.data().receiptNumber)).size, 5);
    const tuitionReceipt = receipts.docs.find((doc) => doc.id === tuitionPartial.receiptId)?.data();
    assert.equal(tuitionReceipt?.grossExpectedAmount, 70_000);
    assert.equal(tuitionReceipt?.discountAmount, 10_000);
    assert.equal(tuitionReceipt?.netExpectedAmount, 60_000);
    assert.equal(tuitionReceipt?.remainingBalance, 30_000);
    assert.equal(tuitionReceipt?.benefits?.[0]?.benefitId, tuitionBenefitId);
    const transportReceipt = receipts.docs.find((doc) => doc.id === transportPartial.receiptId)?.data();
    assert.equal(transportReceipt?.grossExpectedAmount, 4_000);
    assert.equal(transportReceipt?.discountAmount, 1_000);
    assert.equal(transportReceipt?.netExpectedAmount, 3_000);
    assert.equal(transportReceipt?.remainingBalance, 1_000);
    assert.equal(transportReceipt?.benefits?.[0]?.benefitId, transportBenefitId);
    const finance = (await db.collection('studentFinance').doc(studentId).get()).data() || {};
    assert.equal(finance.tuitionByInstallment?.T1?.remainingBalance, 0);
    assert.equal(finance.transportByPeriod?.[september]?.remainingBalance, 0);
    assert.equal(finance.transportByPeriod?.[october], undefined);
    const publicStudent = (await db.collection('students').doc(studentId).get()).data() || {};
    for (const forbidden of [
      'financialBenefits', 'feeT1', 'feeT2', 'feeT3', 'transportMonthlyFee',
      'tuitionExpectedGross', 'tuitionDiscountTotal', 'transportExpectedNet',
    ]) assert.equal(publicStudent[forbidden], undefined, `${forbidden} leaked into students`);

    const allTodayPayments = await db.collection('payments')
      .where('schoolId', '==', testSchoolId).where('date', '==', today).get();
    const allTodayExpenses = await db.collection('expenses')
      .where('schoolId', '==', testSchoolId).where('date', '==', today).get();
    const cashReceived = allTodayPayments.docs.reduce((sum, doc) => {
      const payment = doc.data();
      const status = String(payment.status || 'completed').toLowerCase();
      return String(payment.method || 'cash').toLowerCase() === 'cash'
        && !['pending', 'failed', 'cancelled', 'canceled', 'refunded', 'reversed'].includes(status)
        ? sum + (Number.isSafeInteger(payment.amount) ? payment.amount : 0) : sum;
    }, 0);
    const cashExpenses = allTodayExpenses.docs.reduce((sum, doc) => {
      const amount = doc.data().amount;
      return sum + (Number.isSafeInteger(amount) && amount > 0 ? amount : 0);
    }, 0);
    const openingBalance = Math.max(0, cashExpenses - cashReceived);
    const countedBalance = openingBalance + cashReceived - cashExpenses;
    const closure = (await closeCall({
      schoolId: testSchoolId, academicYear, date: today,
      openingBalance, countedBalance, notes: `E2E encaissements ${suffix}`,
    })).data;
    closureId = closure.closureId;
    assert.equal(closureId, expectedClosureId);
    const closureData = (await db.collection('cashClosures').doc(closureId).get()).data() || {};
    assert.equal(closureData.cashReceived, cashReceived);
    assert.equal(closureData.closedBy, secretaryUid);
    assert.equal(closureData.notes, `E2E encaissements ${suffix}`);
    assert.equal(payments.docs.some((doc) => doc.data().type === 'transport'), true);
    assert.equal(payments.docs.some((doc) => doc.data().type === 'tuition'), true);

    console.log('UI: payment history, receipts, print action and cash drawer');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(studentName, { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Reçus', exact: true }).click();
    const firstReceiptNumber = receipts.docs[0].data().receiptNumber;
    await page.getByText(firstReceiptNumber, { exact: true }).waitFor({ timeout: 20_000 });
    await page.getByPlaceholder(/Rechercher reçu/i).fill(matricule);
    await page.getByText(studentName, { exact: true }).first().waitFor({ timeout: 20_000 });
    assert.ok(await page.getByRole('button', { name: /Imprimer/i }).count() > 0);
    await page.getByRole('button', { name: /Brouillard de Caisse/i }).click();
    await page.getByText(/Clôture & Brouillard de Caisse/i).waitFor({ timeout: 20_000 });
    console.log('RESPONSIVE TRANSPORT: secretary schedule at 360, 768 and 1440 pixels');
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${appUrl}/#/payments`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Encaissement/i }).first().click();
      await page.getByTestId('cash-payment-student').selectOption(benefitStudent);
      await page.getByTestId('cash-payment-type').selectOption('transport');
      await page.getByTestId('transport-auto-allocation').waitFor({ state: 'visible' });
      await page.getByText(/Zone PK34/).waitFor({ state: 'visible' });
      await page.getByText(/Mensualité brute/).waitFor({ state: 'visible' });
      await page.getByText(/Bourse \/ réduction applicable/).waitFor({ state: 'visible' });
      await page.getByText(/Moratoire/).waitFor({ state: 'visible' });
      await page.getByTestId('cash-payment-student').selectOption(secondaryStudent);
      await page.getByTestId('transport-free-secondary').waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('cash-payment-submit').isDisabled(), true);
      await page.getByTestId('cash-payment-amount').waitFor({ state: 'visible' });
      await page.getByTestId('cash-payment-submit').waitFor({ state: 'visible' });
      if (!mobileMoneyExpected) {
        assert.equal(await page.getByTestId('mobile-money-method').count(), 0,
          `Mobile Money must be hidden at ${width}px when activeProvider=none.`);
        await page.getByText(/encaissement en espèces uniquement/i).waitFor({ state: 'visible' });
      }
      await page.getByRole('button', { name: 'Annuler', exact: true }).click();
      await page.getByRole('button', { name: 'Reçus', exact: true }).click();
      await page.getByText(firstReceiptNumber, { exact: true }).waitFor({ timeout: 20_000 });
      assert.ok(await page.getByRole('button', { name: /Imprimer/i }).count() > 0,
        `Receipt print action must remain available at ${width}px.`);
    }
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequestUrls });

    console.log('SECRETARY STAGING AUTH: PASS');
    console.log('STAGING COLLECTIONS E2E: PASS');
  } finally {
    console.log('CLEANUP: deleting only exact E2E fixture records');
    try {
      if (clientAuth?.currentUser) await signOut(clientAuth);
      const markedCollections = [
        'payments', 'receipts', 'transportPaymentAllocations', 'financialBenefits',
        'paymentMoratoriums', 'audit_logs',
      ];
      const markedSnapshots = await Promise.all(markedCollections.map(
        (name) => db.collection(name).where('testRunId', '==', suffix).get(),
      ));
      const paymentSnapshots = markedSnapshots[0];
      const receiptSnapshots = markedSnapshots[1];
      const allocationSnapshots = markedSnapshots[2];
      const benefitSnapshots = markedSnapshots[3];
      paymentSnapshots.docs.forEach((doc) => targetIds.add(doc.id));
      receiptSnapshots.docs.forEach((doc) => targetIds.add(doc.id));
      allocationSnapshots.docs.forEach((doc) => targetIds.add(doc.id));
      const auditSnapshots = secretaryUid && testSchoolId
        ? await db.collection('audit_logs').where('schoolId', '==', testSchoolId).get()
        : { docs: [] };
      const exactAudits = auditSnapshots.docs.filter((doc) => (
        doc.data().testRunId === suffix || targetIds.has(String(doc.data().targetId || ''))
      ));
      const boundedDrain = async () => {
        for (let round = 0; round < 3; round += 1) {
          const snapshots = await Promise.all(markedCollections.slice(0, 5).map(
            (name) => db.collection(name).where('testRunId', '==', suffix).get(),
          ));
          if (snapshots.every((snapshot) => snapshot.empty)) return;
          await deleteSnapshots(db, snapshots);
        }
      };
      await boundedDrain();
      await deleteSnapshots(db, [paymentSnapshots, receiptSnapshots, allocationSnapshots, benefitSnapshots]);
      await deleteSnapshots(db, exactAudits);
      if (referenceId) await db.collection('financialBenefitReferences').doc(referenceId).delete();
      if (testSchoolId) {
        const schoolRef = db.collection('schools').doc(testSchoolId);
        await db.runTransaction(async (transaction) => {
          const [currentSchool, currentStudent, duplicate] = await Promise.all([
            transaction.get(schoolRef),
            transaction.get(db.collection('students').doc(studentId)),
            duplicateReservationId
              ? transaction.get(db.collection('studentDuplicateReservations').doc(duplicateReservationId))
              : Promise.resolve(null),
          ]);
          const schoolPatch = {};
          if (schoolTransportPolicyConfigured) {
            schoolPatch.transportPolicy = schoolTransportPolicyBefore ?? FieldValue.delete();
            schoolPatch.paymentDeadlines = schoolPaymentDeadlinesBefore ?? FieldValue.delete();
          }
          if (currentStudent.exists) {
            assert.equal(currentStudent.data()?.schoolId, testSchoolId);
            assert.equal(currentStudent.data()?.name, studentName);
            assert.equal(currentSchool.data()?.studentsCount, schoolStudentsCountBefore + 1);
            schoolPatch.studentsCount = schoolStudentsCountBefore;
            if (currentSchool.data()?.lastStudentCounterMutationId === studentId) {
              schoolPatch.lastStudentCounterMutationId = schoolBeforeData?.lastStudentCounterMutationId ?? FieldValue.delete();
              schoolPatch.lastStudentCounterMutationType = schoolBeforeData?.lastStudentCounterMutationType ?? FieldValue.delete();
              schoolPatch.updatedAt = schoolBeforeData?.updatedAt ?? FieldValue.delete();
              schoolPatch.updatedBy = schoolBeforeData?.updatedBy ?? FieldValue.delete();
            }
          }
          if (academicYearFixtureId) {
            assert.equal(currentSchool.data()?.activeAcademicYearId, academicYearFixtureId,
              'Refusing to restore an academic year pointer changed by another operation.');
            schoolPatch.activeAcademicYearId = schoolActiveAcademicYearIdBefore ?? FieldValue.delete();
          }
          if (Object.keys(schoolPatch).length > 0) transaction.update(schoolRef, schoolPatch);
          for (const fixtureStudentId of transportFixtureStudentIds) {
            transaction.delete(db.collection('students').doc(fixtureStudentId));
            transaction.delete(db.collection('studentPrivate').doc(fixtureStudentId));
            transaction.delete(db.collection('studentFinance').doc(fixtureStudentId));
          }
          for (const name of [
            'students', 'studentPrivate', 'studentFinance', 'studentParentPrivate', 'studentParentFinance',
          ]) transaction.delete(db.collection(name).doc(studentId));
          if (matriculeReservationId) {
            transaction.delete(db.collection('studentMatriculeReservations').doc(matriculeReservationId));
          }
          if (duplicate?.exists) {
            const ids = Array.isArray(duplicate.data()?.studentIds) ? duplicate.data().studentIds : [];
            const remainingIds = ids.filter((id) => id !== studentId);
            if (remainingIds.length === 0) transaction.delete(duplicate.ref);
            else transaction.update(duplicate.ref, { studentIds: remainingIds });
          }
        });
      }
      if (academicYearFixtureId) {
        const fixtureYearRef = db.collection('academicYears').doc(academicYearFixtureId);
        const fixtureYear = await fixtureYearRef.get();
        if (fixtureYear.exists) {
          assert.equal(fixtureYear.data()?.testRunId, suffix);
          assert.equal(fixtureYear.data()?.schoolId, testSchoolId);
          await fixtureYearRef.delete();
        }
      }
      if (secondaryClassFixtureId) {
        const fixtureClassRef = db.collection('classes').doc(secondaryClassFixtureId);
        const fixtureClass = await fixtureClassRef.get();
        if (fixtureClass.exists) {
          assert.equal(fixtureClass.data()?.testRunId, suffix);
          assert.equal(fixtureClass.data()?.schoolId, testSchoolId);
          await fixtureClassRef.delete();
        }
      }
      if (closureId) {
        const closureRef = db.collection('cashClosures').doc(closureId);
        const closureSnapshot = await closureRef.get();
        if (closureSnapshot.exists) {
          assert.equal(closureSnapshot.data()?.notes, `E2E encaissements ${suffix}`,
            'Refusing to delete a cash closure not owned by this test run.');
          await closureRef.delete();
        }
      }
      await boundedDrain();

      const remaining = {
        student: (await db.collection('students').doc(studentId).get()).exists ? 1 : 0,
        privateDocs: (await Promise.all([
          'studentPrivate', 'studentFinance', 'studentParentPrivate', 'studentParentFinance',
        ].map((name) => db.collection(name).doc(studentId).get()))).filter((item) => item.exists).length,
        payments: (await db.collection('payments').where('studentId', '==', studentId).get()).size,
        receipts: (await db.collection('receipts').where('studentId', '==', studentId).get()).size,
        benefits: (await db.collection('financialBenefits').where('studentId', '==', studentId).get()).size,
        references: referenceId
          && (await db.collection('financialBenefitReferences').doc(referenceId).get()).exists ? 1 : 0,
        closure: closureId && (await db.collection('cashClosures').doc(closureId).get()).exists ? 1 : 0,
        reservations: (await Promise.all([
          matriculeReservationId
            ? db.collection('studentMatriculeReservations').doc(matriculeReservationId).get() : null,
          duplicateReservationId
            ? db.collection('studentDuplicateReservations').doc(duplicateReservationId).get() : null,
        ].filter(Boolean))).filter((item) => item.exists).length,
        academicYearFixture: academicYearFixtureId
          && (await db.collection('academicYears').doc(academicYearFixtureId).get()).exists ? 1 : 0,
        secondaryClassFixture: secondaryClassFixtureId
          && (await db.collection('classes').doc(secondaryClassFixtureId).get()).exists ? 1 : 0,
        allocations: (await db.collection('transportPaymentAllocations').where('testRunId', '==', suffix).get()).size,
        moratoriums: (await db.collection('paymentMoratoriums').where('testRunId', '==', suffix).get()).size,
        audits: (await db.collection('audit_logs').where('testRunId', '==', suffix).get()).size,
        transportStudents: (await Promise.all([...transportFixtureStudentIds].map(
          (id) => db.collection('students').doc(id).get(),
        ))).filter((item) => item.exists).length,
      };
      assert.deepEqual(remaining, {
        student: 0, privateDocs: 0, payments: 0, receipts: 0, benefits: 0,
        references: 0, closure: 0, reservations: 0, academicYearFixture: 0, secondaryClassFixture: 0,
        allocations: 0, moratoriums: 0, audits: 0, transportStudents: 0,
      });
      if (testSchoolId) {
        const schoolAfter = (await db.collection('schools').doc(testSchoolId).get()).data() || {};
        if (Number.isSafeInteger(schoolStudentsCountBefore)) {
          assert.equal(schoolAfter.studentsCount, schoolStudentsCountBefore);
        }
        if (academicYearFixtureId) {
          assert.equal(schoolAfter.activeAcademicYearId ?? null, schoolActiveAcademicYearIdBefore);
        }
        if (schoolTransportPolicyConfigured) {
          assert.deepEqual(schoolAfter.transportPolicy, schoolTransportPolicyBefore);
          assert.deepEqual(schoolAfter.paymentDeadlines, schoolPaymentDeadlinesBefore);
        }
      }
      console.log(`STAGING FIXTURE CLEANUP: PASS testRunId=${suffix} residuals=0 orphans=0`);
    } finally {
      await context.close();
      await browser.close();
      if (clientApp) await deleteApp(clientApp);
      await deleteAdminApp(adminApp);
    }
  }
};

run().catch((error) => {
  const code = error?.code || 'UNKNOWN';
  const details = businessCode(error) || 'NO_BUSINESS_CODE';
  console.error(`STAGING COLLECTIONS E2E: FAIL (${code} / ${details}) ${redactSecrets(error?.message)}`);
  process.exitCode = 1;
});
