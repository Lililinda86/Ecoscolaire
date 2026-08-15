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
  const paymentIds = new Set();
  const receiptNumbers = new Set();
  const targetIds = new Set([tuitionBenefitId, transportBenefitId, draftBenefitId]);

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
    assert.match(String(school.academicYear || ''), /^\d{4}-\d{4}$/);
    const academicYear = String(school.academicYear);
    const [startYear, endYear] = academicYear.split('-').map(Number);
    assert.equal(endYear, startYear + 1);
    const september = `${startYear}-09`;
    const october = `${startYear}-10`;
    const classSnapshot = await db.collection('classes').where('schoolId', '==', testSchoolId).limit(1).get();
    assert.equal(classSnapshot.empty, false, 'No same-school staging class is available for the fixture.');
    const classId = classSnapshot.docs[0].id;
    const today = doualaDate();
    const expectedClosureId = `${testSchoolId}__${today}`;
    assert.equal((await db.collection('cashClosures').doc(expectedClosureId).get()).exists, false,
      'A staging cash closure already exists for today; refusing to overwrite it.');

    console.log('FIXTURES: creating exact fictitious staging records');
    const now = FieldValue.serverTimestamp();
    await Promise.all([
      db.collection('students').doc(studentId).create({
        id: studentId, schoolId: testSchoolId, name: studentName, matricule,
        classId, academicYear, gender: 'F', section: 'francophone', active: true, isActive: true,
        createdAt: now, testFixture: true, testRunId: suffix,
      }),
      db.collection('studentFinance').doc(studentId).create({
        id: studentId, studentId, schoolId: testSchoolId,
        registrationFeeExpected: 15_000, registrationFeePaid: 0,
        feeT1: 70_000, feeT2: 70_000, feeT3: 70_000, transportMonthlyFee: 6_000,
        createdAt: now, testFixture: true, testRunId: suffix,
      }),
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
    const quoteCall = httpsCallable(functions, 'getCollectionQuote');
    const payCall = httpsCallable(functions, 'recordCashPayment');
    const approveCall = httpsCallable(functions, 'approveFinancialBenefit');
    const closeCall = httpsCallable(functions, 'closeCashDrawer');
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
    }, { gross: 6_000, discount: 1_000, net: 5_000, remaining: 5_000 });
    const transportPartial = await pay(requestIds.transportPartial, 3_000, 'transport', { period: september });
    assert.equal(transportPartial.remainingBalance, 2_000);
    const transportFull = await pay(requestIds.transportFull, 2_000, 'transport', { period: september });
    assert.equal(transportFull.remainingBalance, 0);
    await expectCallableFailure(
      () => pay(requestIds.transportOver, 1_000, 'transport', { period: september }),
      ['NO_REMAINING_BALANCE', 'OVERPAYMENT_DENIED'],
    );
    const octoberQuote = await quote('transport', { period: october });
    assert.equal(octoberQuote.grossExpectedAmount, 6_000);
    assert.equal(octoberQuote.discountAmount, 0);
    assert.equal(octoberQuote.remainingBalance, 6_000);

    console.log('CONCURRENCY: simultaneous payments cannot overpay');
    const concurrentResults = await Promise.allSettled([
      pay(requestIds.concurrentA, 50_000, 'tuition', { installment: 'T2' }),
      pay(requestIds.concurrentB, 50_000, 'tuition', { installment: 'T2' }),
    ]);
    assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(concurrentResults.filter((result) => result.status === 'rejected').length, 1);
    assert.equal((await quote('tuition', { installment: 'T2' })).previousPaid, 50_000);

    console.log('RECEIPTS, PROJECTIONS, PRIVACY AND CASH CLOSURE');
    const payments = await db.collection('payments').where('studentId', '==', studentId).get();
    const receipts = await db.collection('receipts').where('studentId', '==', studentId).get();
    assert.equal(payments.size, 5);
    assert.equal(receipts.size, 5);
    assert.equal(paymentIds.size, 5);
    assert.equal(receiptNumbers.size, 5);
    assert.equal(new Set(receipts.docs.map((doc) => doc.data().receiptNumber)).size, 5);
    const tuitionReceipt = receipts.docs.find((doc) => doc.id === tuitionPartial.receiptId)?.data();
    assert.equal(tuitionReceipt?.grossExpectedAmount, 70_000);
    assert.equal(tuitionReceipt?.discountAmount, 10_000);
    assert.equal(tuitionReceipt?.netExpectedAmount, 60_000);
    assert.equal(tuitionReceipt?.remainingBalance, 30_000);
    assert.equal(tuitionReceipt?.benefits?.[0]?.benefitId, tuitionBenefitId);
    const transportReceipt = receipts.docs.find((doc) => doc.id === transportPartial.receiptId)?.data();
    assert.equal(transportReceipt?.grossExpectedAmount, 6_000);
    assert.equal(transportReceipt?.discountAmount, 1_000);
    assert.equal(transportReceipt?.netExpectedAmount, 5_000);
    assert.equal(transportReceipt?.remainingBalance, 2_000);
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
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequestUrls });

    console.log('SECRETARY STAGING AUTH: PASS');
    console.log('STAGING COLLECTIONS E2E: PASS');
  } finally {
    console.log('CLEANUP: deleting only exact E2E fixture records');
    try {
      if (clientAuth?.currentUser) await signOut(clientAuth);
      const paymentSnapshots = await db.collection('payments').where('studentId', '==', studentId).get();
      const receiptSnapshots = await db.collection('receipts').where('studentId', '==', studentId).get();
      const benefitSnapshots = await db.collection('financialBenefits').where('studentId', '==', studentId).get();
      paymentSnapshots.docs.forEach((doc) => targetIds.add(doc.id));
      receiptSnapshots.docs.forEach((doc) => targetIds.add(doc.id));
      const auditSnapshots = secretaryUid && testSchoolId
        ? await db.collection('audit_logs').where('schoolId', '==', testSchoolId).get()
        : { docs: [] };
      const exactAudits = auditSnapshots.docs.filter((doc) => targetIds.has(String(doc.data().targetId || '')));
      await deleteSnapshots(db, [paymentSnapshots, receiptSnapshots, benefitSnapshots]);
      await deleteSnapshots(db, exactAudits);
      const directCleanup = [
        db.collection('studentFinance').doc(studentId).delete(),
        db.collection('students').doc(studentId).delete(),
      ];
      if (referenceId) directCleanup.push(
        db.collection('financialBenefitReferences').doc(referenceId).delete(),
      );
      await Promise.all(directCleanup);
      if (closureId) {
        const closureRef = db.collection('cashClosures').doc(closureId);
        const closureSnapshot = await closureRef.get();
        if (closureSnapshot.exists) {
          assert.equal(closureSnapshot.data()?.notes, `E2E encaissements ${suffix}`,
            'Refusing to delete a cash closure not owned by this test run.');
          await closureRef.delete();
        }
      }

      const remaining = {
        student: (await db.collection('students').doc(studentId).get()).exists ? 1 : 0,
        finance: (await db.collection('studentFinance').doc(studentId).get()).exists ? 1 : 0,
        payments: (await db.collection('payments').where('studentId', '==', studentId).get()).size,
        receipts: (await db.collection('receipts').where('studentId', '==', studentId).get()).size,
        benefits: (await db.collection('financialBenefits').where('studentId', '==', studentId).get()).size,
        references: referenceId
          && (await db.collection('financialBenefitReferences').doc(referenceId).get()).exists ? 1 : 0,
        closure: closureId && (await db.collection('cashClosures').doc(closureId).get()).exists ? 1 : 0,
      };
      assert.deepEqual(remaining, {
        student: 0, finance: 0, payments: 0, receipts: 0, benefits: 0, references: 0, closure: 0,
      });
      console.log('STAGING FIXTURE CLEANUP: PASS');
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
