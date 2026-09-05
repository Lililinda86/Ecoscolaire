import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { applicationDefault, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { chromium } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const EXPECTED_PROJECT = 'ecoscolaire-staging';
const PRODUCTION_PROJECT = 'ecoscolaire-c5861';
const REQUIRED_ENV = [
  'TRANSPORT_APP_URL', 'TRANSPORT_FIREBASE_PROJECT_ID', 'TRANSPORT_TEST_RUN_ID',
  'TRANSPORT_FIXTURE_SCHOOL_ID', 'TRANSPORT_FIREBASE_API_KEY', 'TRANSPORT_FIREBASE_AUTH_DOMAIN',
  'TRANSPORT_FIREBASE_CLIENT_PROJECT_ID', 'TRANSPORT_FIREBASE_STORAGE_BUCKET',
  'TRANSPORT_FIREBASE_MESSAGING_SENDER_ID', 'TRANSPORT_FIREBASE_APP_ID',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
];
const COLLECTIONS = [
  'paymentAllocations', 'transportPaymentAllocations', 'payments', 'receipts', 'financialBenefits',
  'financialBenefitReferences', 'paymentMoratoriums', 'cashClosures', 'cashLedgerDays', 'audit_logs',
  'studentPrivate', 'studentFinance', 'students', 'classes', 'academicYears', 'users', 'schools',
];

const requireConfig = () => {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  assert.deepEqual(missing, [], `Missing staging environment: ${missing.join(', ')}`);
  assert.equal(process.env.TRANSPORT_FIREBASE_PROJECT_ID, EXPECTED_PROJECT);
  assert.equal(process.env.TRANSPORT_FIREBASE_CLIENT_PROJECT_ID, EXPECTED_PROJECT);
  assert.notEqual(process.env.TRANSPORT_FIREBASE_PROJECT_ID, PRODUCTION_PROJECT);
  const appUrl = new URL(process.env.TRANSPORT_APP_URL).origin;
  assert.match(appUrl, /^https:\/\/ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/);
  assert.ok(process.env.VERCEL_AUTOMATION_BYPASS_SECRET.length >= 16);
  return {
    appUrl,
    runId: process.env.TRANSPORT_TEST_RUN_ID.replace(/[^A-Za-z0-9_-]/g, '-'),
    schoolId: process.env.TRANSPORT_FIXTURE_SCHOOL_ID,
    firebaseConfig: {
      apiKey: process.env.TRANSPORT_FIREBASE_API_KEY,
      authDomain: process.env.TRANSPORT_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.TRANSPORT_FIREBASE_CLIENT_PROJECT_ID,
      storageBucket: process.env.TRANSPORT_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.TRANSPORT_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.TRANSPORT_FIREBASE_APP_ID,
    },
  };
};

const businessCode = (error) => error?.details?.businessCode || null;
const expectFailure = async (operation, expected) => {
  try {
    await operation();
    assert.fail(`Expected ${expected}`);
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    assert.equal(businessCode(error), expected, `${error?.code || 'unknown'} / ${businessCode(error) || 'none'}`);
  }
};
const deleteRefs = async (db, refs) => {
  const unique = [...new Map(refs.filter(Boolean).map((ref) => [ref.path, ref])).values()];
  while (unique.length) {
    const batch = db.batch();
    unique.splice(0, 350).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};
const doualaDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const main = async () => {
  const cfg = requireConfig();
  assert.notEqual(cfg.schoolId, 'italo-gsb');
  const suffix = cfg.runId;
  const schoolId = cfg.schoolId;
  const otherSchoolId = `${schoolId}-cross`.slice(0, 125);
  const year = '2026-2027';
  const yearId = `account-v3-year-${suffix}`;
  const classId = `account-v3-class-${suffix}`;
  const studentId = `account-v3-student-${suffix}`;
  const benefitId = `account-v3-benefit-${suffix}`;
  const moratoriumId = `account-v3-moratorium-${suffix}`;
  const authUids = new Set();
  const clientApps = [];
  const adminApp = initializeAdminApp({ credential: applicationDefault(), projectId: EXPECTED_PROJECT }, `account-v3-${suffix}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  assert.equal(adminApp.options.projectId, EXPECTED_PROJECT);
  assert.equal((await db.collection('schools').doc(schoolId).get()).exists, false, 'Fixture school collision.');
  await adminAuth.listUsers(1);
  console.log(`V3 PREFLIGHT: PASS runtime=${EXPECTED_PROJECT} testRunId=${suffix} firstWrite=NO production=NO`);

  let browser;
  const credentials = new Map();
  const createUser = async (role, targetSchoolId = schoolId) => {
    const key = targetSchoolId === otherSchoolId ? 'crossSecretary' : role;
    const email = `${key}-${suffix}@example.invalid`.toLowerCase();
    const password = `${crypto.randomBytes(24).toString('base64url')}!Aa7`;
    const user = await adminAuth.createUser({ email, password, displayName: `Compte V3 ${role}` });
    authUids.add(user.uid);
    await db.collection('users').doc(user.uid).create({
      uid: user.uid, email, name: `Compte V3 ${role}`, role, schoolId: targetSchoolId,
      active: true, isActive: true, testFixture: true, testRunId: suffix,
    });
    credentials.set(key, { uid: user.uid, email, password });
  };
  const makeClient = async (key) => {
    const credential = credentials.get(key);
    const app = initializeApp(cfg.firebaseConfig, `account-v3-${key}-${suffix}`);
    clientApps.push(app);
    const auth = getAuth(app);
    await signInWithEmailAndPassword(auth, credential.email, credential.password);
    return { auth, functions: getFunctions(app, 'us-central1') };
  };

  try {
    await Promise.all([
      db.collection('schools').doc(schoolId).create({
        id: schoolId, name: `École Compte V3 ${suffix}`, code: 'V3-FIX', academicYear: year,
        activeAcademicYearId: yearId, active: true, isActive: true, subscriptionStatus: 'active',
        studentsCount: 1, studentLimit: 20, paymentSettings: { activeProvider: 'none' },
        globalFees: { feeT1: 50_000, feeT2: 40_000, feeT3: 30_000, feeTransport: 0, feeUniforms: 15_000 },
        classFees: { CP: { registration: 15_000, tuition: 120_000, t1: 50_000, t2: 40_000, t3: 30_000 } },
        transportPolicy: { feePolicyId: 'ITALO_PK_2026', billingPeriods: ['2026-09', '2026-10', '2026-11'] },
        paymentDeadlines: { transport: { '2026-09': '2026-09-10', '2026-10': '2026-10-10', '2026-11': '2026-11-10' } },
        feeCatalog: [{ id: 'exam', label: "Frais d'examen", amount: 5_000, active: true, classIds: [classId] }],
        testFixture: true, testRunId: suffix,
      }),
      db.collection('schools').doc(otherSchoolId).create({
        id: otherSchoolId, name: 'Autre école V3 fixture', academicYear: year,
        active: true, isActive: true, subscriptionStatus: 'active', testFixture: true, testRunId: suffix,
      }),
      db.collection('academicYears').doc(yearId).create({
        id: yearId, schoolId, name: year, status: 'active', active: true,
        tuitionPaymentDeadlines: { T1: '2026-09-01', T2: '2027-01-10', T3: '2027-04-10' },
        testFixture: true, testRunId: suffix,
      }),
      db.collection('classes').doc(classId).create({
        id: classId, schoolId, name: 'CP', level: 'primary', cycle: 'primary', section: 'francophone',
        isActive: true, academicYearId: yearId, testFixture: true, testRunId: suffix,
      }),
      db.collection('students').doc(studentId).create({
        id: studentId, schoolId, name: 'Élève Compte V3', matricule: `V3-${suffix}`.slice(0, 80),
        classId, section: 'francophone', academicYearId: yearId, academicYear: year,
        usesTransport: true, active: true, isActive: true, testFixture: true, testRunId: suffix,
      }),
      db.collection('studentPrivate').doc(studentId).create({
        id: studentId, studentId, schoolId, transportZonePk: 14, transportNeighborhood: 'Quartier test',
        transportPickupPoint: 'Point test', testFixture: true, testRunId: suffix,
      }),
      db.collection('studentFinance').doc(studentId).create({
        id: studentId, studentId, schoolId, registrationFeeExpected: 15_000, registrationFeePaid: 0,
        feeT1: 0, feeT2: 0, feeT3: 0, feeUniforms: 15_000, testFixture: true, testRunId: suffix,
      }),
      db.collection('financialBenefits').doc(benefitId).create({
        id: benefitId, schoolId, studentId, academicYear: year, benefitType: 'SCHOLARSHIP',
        paymentType: 'TUITION', installment: 'T1', mode: 'FIXED_AMOUNT', value: 10_000,
        stackable: true, reason: 'Bourse V3 approuvée', status: 'approved', usageCount: 0,
        maximumUses: 1, appliedTargets: [], testFixture: true, testRunId: suffix,
      }),
      db.collection('paymentMoratoriums').doc(moratoriumId).create({
        id: moratoriumId, schoolId, studentId, academicYear: year, paymentType: 'tuition', installment: 'T2',
        status: 'approved', effectiveDueDate: '2027-02-10', reason: 'Moratoire V3 approuvé',
        testFixture: true, testRunId: suffix,
      }),
    ]);
    await createUser('secretary');
    await createUser('owner');
    await createUser('teacher');
    await createUser('secretary', otherSchoolId);
    const secretary = await makeClient('secretary');
    const owner = await makeClient('owner');
    const teacher = await makeClient('teacher');
    const cross = await makeClient('crossSecretary');
    const call = (client, name, data) => httpsCallable(client.functions, name)(data).then((result) => result.data);
    const account = (client = secretary) => call(client, 'getStudentFinancialAccount', { schoolId, studentId, academicYear: year });
    const collect = (client, requestId, allocations) => call(client, 'recordCashCollection', {
      schoolId, studentId, academicYear: year, requestId, allocations,
    });
    const reverse = (client, collectionId, requestId) => call(client, 'reverseCashCollection', {
      collectionId, requestId, reason: 'Contre-opération fixture staging V3',
    });

    const initial = await account();
    const initialByKey = new Map(initial.lines.map((line) => [line.key, line]));
    assert.equal(initialByKey.get('tuition:T1').grossExpectedAmount, 50_000);
    assert.equal(initialByKey.get('tuition:T1').netExpectedAmount, 40_000);
    assert.equal(initialByKey.get('tuition:T2').moratoriumStatus, 'ACTIVE');
    assert.equal(initialByKey.get('transport').remainingBalance, 12_000);
    assert.equal(initialByKey.get('uniforms').remainingBalance, 15_000);
    assert.equal(initialByKey.get('other:exam').remainingBalance, 5_000);
    await expectFailure(() => account(teacher), 'PERMISSION_DENIED');
    await expectFailure(() => account(cross), 'CROSS_SCHOOL_DENIED');

    const requestId = `account_v3_multi_${suffix}`;
    const allocations = [
      { type: 'tuition', installment: 'T1', amount: 20_000 },
      { type: 'transport', amount: 4_000 },
      { type: 'uniforms', amount: 15_000 },
      { type: 'other', feeId: 'exam', amount: 5_000 },
    ];
    const first = await collect(secretary, requestId, allocations);
    assert.equal(first.amount, 44_000);
    assert.equal(first.lineItems.length, 4);
    assert.equal(first.idempotentReplay, false);
    const receipt = (await db.collection('receipts').doc(first.receiptId).get()).data();
    assert.equal(receipt.lineItems.length, 4);
    assert.equal(receipt.lineItems.reduce((sum, line) => sum + line.amount, 0), 44_000);
    assert.equal(receipt.studentName, 'Élève Compte V3');
    assert.equal(receipt.paymentMethod, 'cash');
    assert.ok(receipt.createdAt);
    assert.equal((await db.collection('paymentAllocations').where('collectionId', '==', first.collectionId).get()).size, 4);
    assert.equal((await db.collection('transportPaymentAllocations').where('paymentId', '==', first.collectionId).get()).size, 1);
    const replay = await collect(secretary, requestId, allocations);
    assert.equal(replay.idempotentReplay, true);
    assert.equal((await db.collection('payments').where('requestId', '==', requestId).get()).size, 1);
    await expectFailure(() => collect(secretary, requestId, [{ type: 'tuition', installment: 'T1', amount: 19_999 }]), 'IDEMPOTENCY_CONFLICT');

    const single = await collect(secretary, `account_v3_single_${suffix}`, [
      { type: 'tuition', installment: 'T1', amount: 10_000 },
    ]);
    assert.equal(single.lineItems.length, 1);
    assert.equal(single.lineItems[0].remainingBalance, 10_000);
    await expectFailure(() => collect(secretary, `account_v3_over_${suffix}`, [
      { type: 'tuition', installment: 'T1', amount: 10_001 },
    ]), 'OVERPAYMENT_DENIED');

    await expectFailure(() => reverse(secretary, first.collectionId, `account_v3_reverse_denied_${suffix}`), 'PERMISSION_DENIED');
    const reversalRequestId = `account_v3_reverse_${suffix}`;
    const reversed = await reverse(owner, first.collectionId, reversalRequestId);
    assert.equal(reversed.amount, -44_000);
    assert.equal(reversed.idempotentReplay, false);
    assert.match(reversed.correctionReceiptNumber, /^ANN-/);
    assert.equal((await reverse(owner, first.collectionId, reversalRequestId)).idempotentReplay, true);
    assert.equal((await db.collection('payments').doc(first.collectionId).get()).data().amount, 44_000);
    const correction = (await db.collection('receipts').doc(reversed.correctionReceiptId).get()).data();
    assert.equal(correction.kind, 'PAYMENT_REVERSAL');
    assert.equal(correction.lineItems.length, 4);
    const final = await account();
    assert.equal(final.lines.find((line) => line.key === 'tuition:T1').remainingBalance, 30_000);
    assert.equal(final.lines.find((line) => line.key === 'transport').remainingBalance, 12_000);
    assert.equal(final.lines.find((line) => line.key === 'uniforms').remainingBalance, 15_000);
    assert.equal(final.lines.find((line) => line.key === 'other:exam').remainingBalance, 5_000);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.route(`${cfg.appUrl}/**`, (route) => route.continue({ headers: {
      ...route.request().headers(), 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'x-vercel-set-bypass-cookie': 'true',
    } }));
    await page.goto(`${cfg.appUrl}/#/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByTestId('login-email').fill(credentials.get('secretary').email);
    await page.getByTestId('login-password').fill(credentials.get('secretary').password);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('nav-payments').waitFor({ state: 'visible', timeout: 30_000 });
    await page.goto(`${cfg.appUrl}/#/payments`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByTestId('open-cash-payment').waitFor({ state: 'visible', timeout: 30_000 });
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByTestId('open-cash-payment').click();
      await page.getByTestId('cash-payment-student').selectOption(studentId);
      await page.getByRole('heading', { name: 'Frais applicables' }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.getByText('RÉDUCTION APPLIQUÉE', { exact: true }).waitFor({ state: 'visible' });
      await page.getByText(/Moratoire jusqu’au/).waitFor({ state: 'visible' });
      const modal = page.getByTestId('modal-content');
      const metrics = await modal.evaluate((element) => ({
        left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
        documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth,
      }));
      assert.ok(metrics.left >= -1 && metrics.right <= width + 1, `Modal outside ${width}px viewport.`);
      assert.ok(metrics.documentWidth <= metrics.viewportWidth + 1, `Global overflow at ${width}px.`);
      const submit = page.getByTestId('cash-payment-submit');
      await submit.scrollIntoViewIfNeeded();
      const box = await submit.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, `Submit outside ${width}px viewport.`);
      assert.ok(box.height >= 40, `Submit target too small at ${width}px.`);
      await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    }
    await context.close();
    console.log('V3 STAGING CONTRACT: PASS A=account B=single-tuition C=partial D=multi-fee E=optional-fee F=transport G=approved-benefit H=moratorium I=idempotency J=receipt K=reversal');
    console.log('V3 RESPONSIVE: PASS widths=360,768,1440 overflow=0 actions=accessible');
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    for (const app of clientApps) {
      const auth = getAuth(app);
      if (auth.currentUser) await signOut(auth).catch(() => undefined);
      await deleteApp(app).catch(() => undefined);
    }
    console.log(`V3 CLEANUP: exact fixture school=${schoolId} testRunId=${suffix}`);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    for (let round = 0; round < 2; round += 1) {
      const refs = [];
      for (const collection of COLLECTIONS) {
        for (const targetSchoolId of [schoolId, otherSchoolId]) {
          const snapshot = await db.collection(collection).where('schoolId', '==', targetSchoolId).get();
          refs.push(...snapshot.docs.map((item) => item.ref));
        }
      }
      refs.push(db.collection('schools').doc(schoolId), db.collection('schools').doc(otherSchoolId));
      refs.push(db.collection('classes').doc(classId), db.collection('academicYears').doc(yearId));
      refs.push(db.collection('students').doc(studentId), db.collection('studentPrivate').doc(studentId), db.collection('studentFinance').doc(studentId));
      refs.push(db.collection('financialBenefits').doc(benefitId), db.collection('paymentMoratoriums').doc(moratoriumId));
      refs.push(db.collection('counters').doc(`receipts_${schoolId}`), db.collection('cashLedgerDays').doc(`${schoolId}_${doualaDate()}`));
      await deleteRefs(db, refs);
      for (const uid of authUids) await adminAuth.deleteUser(uid).catch((error) => {
        if (error?.code !== 'auth/user-not-found') throw error;
      });
      if (round === 0) await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    const residuals = {};
    for (const collection of COLLECTIONS) {
      let count = 0;
      for (const targetSchoolId of [schoolId, otherSchoolId]) {
        count += (await db.collection(collection).where('schoolId', '==', targetSchoolId).get()).size;
      }
      residuals[collection] = count;
    }
    residuals.authUsers = 0;
    for (const uid of authUids) {
      try { await adminAuth.getUser(uid); residuals.authUsers += 1; } catch (error) {
        if (error?.code !== 'auth/user-not-found') throw error;
      }
    }
    residuals.counters = (await db.collection('counters').doc(`receipts_${schoolId}`).get()).exists ? 1 : 0;
    const orphans = Object.values(residuals).reduce((sum, value) => sum + value, 0);
    assert.equal(orphans, 0, `V3 fixture cleanup residuals: ${JSON.stringify(residuals)}`);
    console.log(`V3 STAGING CLEANUP: PASS testRunId=${suffix} residuals=0 orphans=0 productionDataTouched=NO`);
    await deleteAdminApp(adminApp);
  }
};

main().catch((error) => {
  console.error(`V3 STAGING RUNNER: FAIL ${error?.code || 'UNKNOWN'} ${error?.message || error}`);
  process.exitCode = 1;
});
