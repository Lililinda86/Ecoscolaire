import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { applicationDefault, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { chromium } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getFirestore as getClientFirestore, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const EXPECTED_PROJECT = 'ecoscolaire-c5861';
const EXPECTED_SCHOOL = 'italo-gsb';
const EXPECTED_URL = 'https://ecoscolaire.vercel.app';
const MARKER_PREFIX = 'ITALO-PROD-FIN-TEST-';
const REQUIRED_ENV = [
  'PRODUCTION_APP_URL', 'PRODUCTION_FIREBASE_PROJECT_ID', 'PRODUCTION_SCHOOL_ID',
  'PRODUCTION_FIREBASE_API_KEY', 'PRODUCTION_FIREBASE_AUTH_DOMAIN',
  'PRODUCTION_FIREBASE_STORAGE_BUCKET', 'PRODUCTION_FIREBASE_MESSAGING_SENDER_ID',
  'PRODUCTION_FIREBASE_APP_ID', 'TEST_MARKER_PREFIX'
];

const requireEnvironment = () => {
  const missing = REQUIRED_ENV.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing required Production configuration: ${missing.join(', ')}`);
  assert.equal(process.env.PRODUCTION_APP_URL, EXPECTED_URL);
  assert.equal(process.env.PRODUCTION_FIREBASE_PROJECT_ID, EXPECTED_PROJECT);
  assert.equal(process.env.PRODUCTION_SCHOOL_ID, EXPECTED_SCHOOL);
  assert.equal(process.env.TEST_MARKER_PREFIX, MARKER_PREFIX);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
};

const businessCode = error => error?.details?.businessCode || null;
const expectFailure = async (operation, expectedCodes) => {
  try {
    await operation();
    assert.fail(`Expected failure: ${expectedCodes.join(' or ')}`);
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    assert.ok(
      expectedCodes.includes(businessCode(error)) || expectedCodes.includes(error?.code),
      `Unexpected callable failure (${error?.code || 'unknown'} / ${businessCode(error) || 'none'})`
    );
  }
};

const doualaDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = type => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const hashId = (prefix, values) => `${prefix}_${crypto.createHash('sha256')
  .update(JSON.stringify(values), 'utf8').digest('hex')}`;

const countQuery = async query => (await query.count().get()).data().count;

const inventory = async (db, schoolId) => {
  const collections = [
    'students', 'payments', 'receipts', 'financialBenefits',
    'financialBenefitReferences', 'cashClosures', 'studentFinance'
  ];
  const counts = {};
  for (const name of collections) {
    counts[name] = await countQuery(db.collection(name).where('schoolId', '==', schoolId));
  }
  const counter = await db.collection('counters').doc(`receipts_${schoolId}`).get();
  return {
    counts,
    receiptCounter: counter.exists ? counter.data()?.lastReceiptNumber ?? null : null
  };
};

const deleteRefs = async (db, refs) => {
  const unique = [...new Map(refs.filter(Boolean).map(ref => [ref.path, ref])).values()];
  while (unique.length) {
    const batch = db.batch();
    unique.splice(0, 400).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
};

const waitForExactStudent = async (db, marker, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await db.collection('students')
      .where('schoolId', '==', EXPECTED_SCHOOL).where('name', '==', marker).get();
    if (snapshot.size === 1) return snapshot.docs[0];
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  throw new Error('The UI-created TEST student was not found exactly once.');
};

const createClient = (name) => {
  const app = initializeApp({
    apiKey: process.env.PRODUCTION_FIREBASE_API_KEY,
    authDomain: process.env.PRODUCTION_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.PRODUCTION_FIREBASE_PROJECT_ID,
    storageBucket: process.env.PRODUCTION_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.PRODUCTION_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.PRODUCTION_FIREBASE_APP_ID
  }, name);
  return { app, auth: getAuth(app), functions: getFunctions(app, 'us-central1'), db: getClientFirestore(app) };
};

const run = async () => {
  requireEnvironment();
  const runId = `${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  const marker = `${MARKER_PREFIX}${runId}`;
  const studentName = `${marker} STUDENT`;
  const secretaryEmail = `${marker.toLowerCase()}-secretary@example.invalid`;
  const ownerEmail = `${marker.toLowerCase()}-owner@example.invalid`;
  const secretaryPassword = `${crypto.randomBytes(32).toString('base64url')}!Aa9`;
  const ownerPassword = `${crypto.randomBytes(32).toString('base64url')}!Aa9`;
  const today = doualaDate();
  const requestIds = {
    registrationUi: `${marker}-REG-UI`,
    t1Partial: `${marker}-T1-PART`, t1Full: `${marker}-T1-FULL`, t1Over: `${marker}-T1-OVER`,
    t2A: `${marker}-T2-A`, t2B: `${marker}-T2-B`, t2Full: `${marker}-T2-FULL`,
    t3Double: `${marker}-T3-DOUBLE`,
    transportPartial: `${marker}-TR-PART`, transportFull: `${marker}-TR-FULL`, transportOver: `${marker}-TR-OVER`,
    scholarship: `${marker}-SCHOLARSHIP`, voucher: `${marker}-VOUCHER`, deniedBenefit: `${marker}-DENIED`
  };

  const adminApp = initializeAdminApp({ credential: applicationDefault(), projectId: EXPECTED_PROJECT }, `prod-fin-${runId}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  assert.equal(adminApp.options.projectId, EXPECTED_PROJECT);

  const schoolRef = db.collection('schools').doc(EXPECTED_SCHOOL);
  const schoolBefore = await schoolRef.get();
  assert.equal(schoolBefore.exists, true, 'ITALO school is missing.');
  const school = schoolBefore.data() || {};
  assert.match(String(school.academicYear || ''), /^\d{4}-\d{4}$/);
  const academicYear = String(school.academicYear);
  const [startYear, endYear] = academicYear.split('-').map(Number);
  assert.equal(endYear, startYear + 1);
  const september = `${startYear}-09`;
  const october = `${startYear}-10`;
  const configuredTransport = school.globalFees?.feeTransport;
  assert.ok(Number.isSafeInteger(configuredTransport) && configuredTransport > 0,
    'P1 CONFIGURATION: no positive Production transport tariff is configured.');

  const preInventory = await inventory(db, EXPECTED_SCHOOL);
  const existingClosure = await db.collection('cashClosures').doc(`${EXPECTED_SCHOOL}__${today}`).get();
  const todayPayments = await db.collection('payments')
    .where('schoolId', '==', EXPECTED_SCHOOL).where('date', '==', today).get();
  const todayExpenses = await db.collection('expenses')
    .where('schoolId', '==', EXPECTED_SCHOOL).where('date', '==', today).get();
  assert.equal(existingClosure.exists, false, 'P1 CONFIGURATION: today already has a Production cash closure.');
  assert.equal(todayPayments.empty, true, 'P1 SAFETY: real ITALO payments already exist today.');
  assert.equal(todayExpenses.empty, true, 'P1 SAFETY: real ITALO expenses already exist today.');
  console.log(`PRE-INVENTORY: ${JSON.stringify(preInventory)}`);

  let secretaryUid = null;
  let ownerUid = null;
  let studentId = null;
  let matriculeReservationId = null;
  let duplicateReservationId = null;
  let closureId = null;
  let secretaryClient = null;
  let ownerClient = null;
  let browser = null;
  const benefitIds = new Set();
  const benefitReferenceIds = new Set();
  const paymentIds = new Set();
  const receiptNumbers = new Set();
  const auditTargetIds = new Set();
  let testError = null;

  try {
    const secretaryUser = await adminAuth.createUser({
      email: secretaryEmail, password: secretaryPassword, disabled: false, displayName: `${marker}-SECRETARY`
    });
    secretaryUid = secretaryUser.uid;
    const ownerUser = await adminAuth.createUser({
      email: ownerEmail, password: ownerPassword, disabled: false, displayName: `${marker}-OWNER`
    });
    ownerUid = ownerUser.uid;
    const now = FieldValue.serverTimestamp();
    await Promise.all([
      db.collection('users').doc(secretaryUid).create({
        id: secretaryUid, email: secretaryEmail, displayName: `${marker}-SECRETARY`, role: 'secretary',
        schoolId: EXPECTED_SCHOOL, active: true, isActive: true, status: 'active', testMarker: marker, createdAt: now
      }),
      db.collection('users').doc(ownerUid).create({
        id: ownerUid, email: ownerEmail, displayName: `${marker}-OWNER`, role: 'owner',
        schoolId: EXPECTED_SCHOOL, active: true, isActive: true, status: 'active', testMarker: marker, createdAt: now
      })
    ]);

    secretaryClient = createClient(`prod-secretary-${runId}`);
    ownerClient = createClient(`prod-owner-${runId}`);
    await signInWithEmailAndPassword(secretaryClient.auth, secretaryEmail, secretaryPassword);
    await signInWithEmailAndPassword(ownerClient.auth, ownerEmail, ownerPassword);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: false });
    const page = await context.newPage();
    const firebaseRequests = [];
    page.on('request', request => {
      const url = request.url();
      if (/firebase|googleapis|cloudfunctions/i.test(url)) firebaseRequests.push(url);
    });
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${EXPECTED_URL}/#/diagnostic`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('diagnostic-firebase-project').waitFor({ state: 'visible', timeout: 30_000 });
    assert.equal((await page.getByTestId('diagnostic-firebase-project').textContent())?.trim(), EXPECTED_PROJECT);
    assert.equal(firebaseRequests.some(url => url.includes('ecoscolaire-staging')), false);

    await page.goto(`${EXPECTED_URL}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email').fill(secretaryEmail);
    await page.getByTestId('login-password').fill(secretaryPassword);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 30_000 });

    // The student is created through the real Production UI and createStudentSecure callable.
    await page.goto(`${EXPECTED_URL}/#/students`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Ajouter un élève', exact: true }).click();
    await page.getByPlaceholder('Ex: N’GONO').fill(marker);
    await page.getByPlaceholder('Ex: Mballa Élise').fill('STUDENT');
    await page.locator('input[type="date"]').first().fill('2015-01-01');
    await page.getByRole('button', { name: 'Suivant', exact: true }).click();
    const studentForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Suivant', exact: true }) });
    await studentForm.locator('select[required]').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Suivant', exact: true }).click();
    await page.getByPlaceholder('Ex: Paul Dupont').fill(`${marker}-GUARDIAN`);
    await page.getByPlaceholder('Ex: +237650336558').last().fill('000000000');
    await page.getByRole('button', { name: 'Suivant', exact: true }).click();
    await page.locator('#student-no-medical-condition-checkbox').check();
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();

    const studentSnapshot = await waitForExactStudent(db, studentName);
    studentId = studentSnapshot.id;
    const student = studentSnapshot.data();
    assert.ok(student.matricule && /^MAT-\d{4}-\d{4}$/.test(String(student.matricule)));
    matriculeReservationId = String(student.matriculeReservationId);
    duplicateReservationId = String(student.duplicateReservationId);
    assert.ok(matriculeReservationId && duplicateReservationId);
    const financeRef = db.collection('studentFinance').doc(studentId);
    const financeSnapshot = await financeRef.get();
    assert.equal(financeSnapshot.exists, true);
    const finance = financeSnapshot.data() || {};
    for (const key of ['registrationFeeExpected', 'feeT1', 'feeT2', 'feeT3']) {
      assert.ok(Number.isSafeInteger(finance[key]) && finance[key] > 0, `P1 CONFIGURATION: ${key} is missing.`);
    }
    await financeRef.update({ transportMonthlyFee: configuredTransport, testMarker: marker });

    const ownerCreate = httpsCallable(ownerClient.functions, 'createFinancialBenefit');
    const ownerApprove = httpsCallable(ownerClient.functions, 'approveFinancialBenefit');
    const secretaryCreate = httpsCallable(secretaryClient.functions, 'createFinancialBenefit');
    const secretaryApprove = httpsCallable(secretaryClient.functions, 'approveFinancialBenefit');
    const secretaryQuote = httpsCallable(secretaryClient.functions, 'getCollectionQuote');
    const secretaryPay = httpsCallable(secretaryClient.functions, 'recordCashPayment');
    const secretaryClose = httpsCallable(secretaryClient.functions, 'closeCashDrawer');
    const quote = async (type, extra = {}) => (await secretaryQuote({
      schoolId: EXPECTED_SCHOOL, studentId, academicYear, type, ...extra
    })).data;
    const pay = async (requestId, amount, type, extra = {}) => {
      const result = (await secretaryPay({
        schoolId: EXPECTED_SCHOOL, studentId, academicYear, requestId, amount, type,
        description: marker, ...extra
      })).data;
      paymentIds.add(result.paymentId);
      auditTargetIds.add(result.paymentId);
      receiptNumbers.add(result.receiptNumber);
      return result;
    };

    await expectFailure(() => secretaryCreate({
      schoolId: EXPECTED_SCHOOL, studentId, academicYear, requestId: requestIds.deniedBenefit,
      benefitType: 'SCHOLARSHIP', paymentType: 'TUITION', mode: 'FIXED_AMOUNT', value: 1,
      installment: 'T1', stackable: true, reason: `${marker} denied`
    }), ['PERMISSION_DENIED', 'functions/permission-denied']);

    const t1Gross = finance.feeT1;
    const scholarshipValue = Math.max(1, Math.floor(t1Gross / 10));
    const scholarship = (await ownerCreate({
      schoolId: EXPECTED_SCHOOL, studentId, academicYear, requestId: requestIds.scholarship,
      benefitType: 'SCHOLARSHIP', paymentType: 'TUITION', mode: 'FIXED_AMOUNT', value: scholarshipValue,
      installment: 'T1', stackable: true, reason: `${marker} scholarship`
    })).data;
    benefitIds.add(scholarship.benefitId); auditTargetIds.add(scholarship.benefitId);
    await expectFailure(() => secretaryApprove({ benefitId: scholarship.benefitId }),
      ['PERMISSION_DENIED', 'functions/permission-denied']);
    await ownerApprove({ benefitId: scholarship.benefitId });

    const voucherValue = Math.max(1, Math.floor(configuredTransport / 10));
    const voucherReference = `${marker}-VOUCHER`.slice(0, 80).toUpperCase();
    const voucher = (await ownerCreate({
      schoolId: EXPECTED_SCHOOL, studentId, academicYear, requestId: requestIds.voucher,
      benefitType: 'DISCOUNT_VOUCHER', paymentType: 'TRANSPORT', mode: 'FIXED_AMOUNT', value: voucherValue,
      transportStartPeriod: september, transportEndPeriod: september, reference: voucherReference,
      singleUse: true, maximumUses: 1, stackable: true, reason: `${marker} voucher`
    })).data;
    benefitIds.add(voucher.benefitId); auditTargetIds.add(voucher.benefitId);
    await ownerApprove({ benefitId: voucher.benefitId });
    benefitReferenceIds.add(hashId('benefitref', [EXPECTED_SCHOOL, voucherReference]));
    await assert.rejects(
      () => updateDoc(doc(secretaryClient.db, 'financialBenefits', voucher.benefitId), { value: voucherValue + 1 }),
      /permission|insufficient/i
    );

    // Registration is submitted through Paiements -> Encaissements in the real Production UI.
    const registrationQuote = await quote('registration_fee');
    await page.goto(`${EXPECTED_URL}/#/payments`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Encaissement/ }).first().click();
    const paymentForm = page.locator('form').filter({
      has: page.getByRole('button', { name: "Enregistrer l'encaissement", exact: true })
    });
    await paymentForm.locator('select').nth(0).selectOption(studentId);
    await paymentForm.locator('select').nth(1).selectOption('registration_fee');
    await paymentForm.locator('input[type="number"]').fill(String(registrationQuote.remainingBalance));
    await page.getByRole('button', { name: "Enregistrer l'encaissement", exact: true }).click();
    await page.getByRole('heading', { name: 'Nouvel Encaissement' }).waitFor({ state: 'hidden', timeout: 30_000 });
    const registrationPayments = await db.collection('payments')
      .where('studentId', '==', studentId).where('type', '==', 'registration_fee').get();
    assert.equal(registrationPayments.size, 1);
    registrationPayments.docs.forEach(item => { paymentIds.add(item.id); auditTargetIds.add(item.id); });

    const t1Initial = await quote('tuition', { installment: 'T1' });
    assert.equal(t1Initial.grossExpectedAmount, t1Gross);
    assert.equal(t1Initial.discountAmount, scholarshipValue);
    const t1PartAmount = Math.max(1, Math.floor(t1Initial.remainingBalance / 2));
    const t1Part = await pay(requestIds.t1Partial, t1PartAmount, 'tuition', { installment: 'T1' });
    assert.equal(t1Part.remainingBalance, t1Initial.remainingBalance - t1PartAmount);
    const t1Full = await pay(requestIds.t1Full, t1Part.remainingBalance, 'tuition', { installment: 'T1' });
    assert.equal(t1Full.remainingBalance, 0);
    await expectFailure(() => pay(requestIds.t1Over, 1, 'tuition', { installment: 'T1' }),
      ['NO_REMAINING_BALANCE', 'OVERPAYMENT_DENIED']);

    const t2Initial = await quote('tuition', { installment: 'T2' });
    const concurrentAmount = Math.floor(t2Initial.remainingBalance * 0.8);
    const concurrent = await Promise.allSettled([
      pay(requestIds.t2A, concurrentAmount, 'tuition', { installment: 'T2' }),
      pay(requestIds.t2B, concurrentAmount, 'tuition', { installment: 'T2' })
    ]);
    assert.equal(concurrent.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter(item => item.status === 'rejected').length, 1);
    const t2After = await quote('tuition', { installment: 'T2' });
    assert.equal(t2After.previousPaid, concurrentAmount);
    await pay(requestIds.t2Full, t2After.remainingBalance, 'tuition', { installment: 'T2' });
    assert.equal((await quote('tuition', { installment: 'T2' })).remainingBalance, 0);

    const t3Initial = await quote('tuition', { installment: 'T3', grossExpectedAmount: 1 });
    assert.equal(t3Initial.grossExpectedAmount, finance.feeT3);
    const t3Double = await Promise.all([
      pay(requestIds.t3Double, t3Initial.remainingBalance, 'tuition', { installment: 'T3' }),
      pay(requestIds.t3Double, t3Initial.remainingBalance, 'tuition', { installment: 'T3' })
    ]);
    assert.equal(t3Double[0].paymentId, t3Double[1].paymentId);
    assert.equal(t3Double.filter(item => item.idempotentReplay === true).length, 1);
    assert.equal((await quote('tuition', { installment: 'T3' })).remainingBalance, 0);

    const transportInitial = await quote('transport', { period: september });
    assert.equal(transportInitial.grossExpectedAmount, configuredTransport);
    assert.equal(transportInitial.discountAmount, voucherValue);
    const transportPartAmount = Math.max(1, Math.floor(transportInitial.remainingBalance / 2));
    const transportPart = await pay(requestIds.transportPartial, transportPartAmount, 'transport', { period: september });
    const transportFull = await pay(requestIds.transportFull, transportPart.remainingBalance, 'transport', { period: september });
    assert.equal(transportFull.remainingBalance, 0);
    await expectFailure(() => pay(requestIds.transportOver, 1, 'transport', { period: september }),
      ['NO_REMAINING_BALANCE', 'OVERPAYMENT_DENIED']);
    const octoberQuote = await quote('transport', { period: october });
    assert.equal(octoberQuote.grossExpectedAmount, configuredTransport);
    assert.equal(octoberQuote.previousPaid, 0);

    await expectFailure(() => secretaryQuote({
      schoolId: `${EXPECTED_SCHOOL}-other`, studentId, academicYear, type: 'tuition', installment: 'T1'
    }), ['CROSS_SCHOOL_DENIED', 'functions/permission-denied']);

    const payments = await db.collection('payments').where('studentId', '==', studentId).get();
    const receipts = await db.collection('receipts').where('studentId', '==', studentId).get();
    payments.docs.forEach(item => { paymentIds.add(item.id); auditTargetIds.add(item.id); });
    receipts.docs.forEach(item => receiptNumbers.add(item.data().receiptNumber));
    assert.equal(payments.size, receipts.size);
    assert.equal(new Set(receipts.docs.map(item => item.data().receiptNumber)).size, receipts.size);
    for (const receipt of receipts.docs.map(item => item.data())) {
      assert.equal(receipt.studentId, studentId);
      assert.equal(receipt.studentName, studentName);
      assert.equal(receipt.studentRegistrationNumber, student.matricule);
      assert.ok(['registration_fee', 'tuition', 'transport'].includes(receipt.type));
      for (const key of [
        'grossExpectedAmount', 'discountAmount', 'netExpectedAmount', 'previousPaid',
        'amount', 'newPaid', 'remainingBalance'
      ]) assert.ok(Number.isSafeInteger(receipt[key]), `Receipt field ${key} is invalid.`);
      assert.equal(receipt.collectedByUserId, secretaryUid);
      assert.ok(receipt.date && receipt.createdAt);
    }
    const immutableReceipt = receipts.docs[0];
    const immutableBefore = JSON.stringify(immutableReceipt.data());
    assert.equal(JSON.stringify((await immutableReceipt.ref.get()).data()), immutableBefore);

    const allTodayPayments = await db.collection('payments')
      .where('schoolId', '==', EXPECTED_SCHOOL).where('date', '==', today).get();
    assert.equal(allTodayPayments.size, payments.size);
    const cashReceived = allTodayPayments.docs.reduce((sum, item) => sum + item.data().amount, 0);
    const closure = (await secretaryClose({
      schoolId: EXPECTED_SCHOOL, academicYear, date: today,
      openingBalance: 0, countedBalance: cashReceived, notes: marker
    })).data;
    closureId = closure.closureId;
    auditTargetIds.add(closureId);
    const closureSnapshot = await db.collection('cashClosures').doc(closureId).get();
    assert.equal(closureSnapshot.data()?.cashReceived, cashReceived);
    assert.equal(closureSnapshot.data()?.closedBy, secretaryUid);
    assert.equal(closureSnapshot.data()?.notes, marker);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(studentName, { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Reçus', exact: true }).click();
    await page.getByPlaceholder(/Rechercher reçu/i).fill(String(student.matricule));
    await page.getByText(studentName, { exact: true }).first().waitFor({ timeout: 20_000 });
    assert.ok(await page.getByRole('button', { name: /Imprimer/i }).count() > 0);
    await page.getByRole('button', { name: /Brouillard de Caisse/i }).click();
    await page.getByText(/Clôture & Brouillard de Caisse/i).waitFor({ timeout: 20_000 });
    await page.getByText(marker, { exact: true }).waitFor({ timeout: 20_000 });

    console.log('PRODUCTION FINANCIAL E2E: PASS');
  } catch (error) {
    testError = error;
    console.error(`FIRST REAL ERROR: ${error?.message || error}`);
  } finally {
    console.log('CLEANUP: exact TEST fixture IDs only');
    let cleanupError = null;
    try {
      if (secretaryClient?.auth.currentUser) await signOut(secretaryClient.auth);
      if (ownerClient?.auth.currentUser) await signOut(ownerClient.auth);
      if (browser) await browser.close();

      if (studentId) {
        const [paymentSnapshots, receiptSnapshots, benefitSnapshots] = await Promise.all([
          db.collection('payments').where('studentId', '==', studentId).get(),
          db.collection('receipts').where('studentId', '==', studentId).get(),
          db.collection('financialBenefits').where('studentId', '==', studentId).get()
        ]);
        for (const snapshot of [...paymentSnapshots.docs, ...receiptSnapshots.docs, ...benefitSnapshots.docs]) {
          assert.equal(snapshot.data().schoolId, EXPECTED_SCHOOL);
          if (snapshot.ref.parent.id === 'payments') {
            assert.ok(snapshot.data().description === marker || snapshot.data().studentId === studentId);
          }
          auditTargetIds.add(snapshot.id);
        }
        if (closureId) {
          const exactClosure = await db.collection('cashClosures').doc(closureId).get();
          assert.equal(exactClosure.exists, true);
          assert.equal(exactClosure.data()?.notes, marker);
          assert.equal(exactClosure.data()?.closedBy, secretaryUid);
        }
        await deleteRefs(db, [
          ...paymentSnapshots.docs.map(item => item.ref),
          ...receiptSnapshots.docs.map(item => item.ref),
          ...benefitSnapshots.docs.map(item => item.ref),
          ...[...benefitReferenceIds].map(id => db.collection('financialBenefitReferences').doc(id)),
          closureId ? db.collection('cashClosures').doc(closureId) : null
        ]);

        const auditSnapshots = await db.collection('audit_logs').where('schoolId', '==', EXPECTED_SCHOOL).get();
        const exactTestAudits = auditSnapshots.docs.filter(item => {
          const data = item.data();
          return auditTargetIds.has(String(data.targetId || ''))
            || String(data.targetId || '') === studentId
            || String(data.targetName || '').includes(marker);
        });
        await deleteRefs(db, exactTestAudits.map(item => item.ref));

        await db.runTransaction(async transaction => {
          const [currentSchool, student, duplicate] = await Promise.all([
            transaction.get(schoolRef),
            transaction.get(db.collection('students').doc(studentId)),
            duplicateReservationId
              ? transaction.get(db.collection('studentDuplicateReservations').doc(duplicateReservationId))
              : Promise.resolve(null)
          ]);
          if (student.exists) {
            assert.equal(student.data()?.schoolId, EXPECTED_SCHOOL);
            assert.equal(String(student.data()?.name || '').includes(marker), true);
            const currentCount = currentSchool.data()?.studentsCount;
            assert.ok(Number.isSafeInteger(currentCount) && currentCount > 0);
            const schoolPatch = { studentsCount: currentCount - 1 };
            if (currentSchool.data()?.lastStudentCounterMutationId === studentId) {
              schoolPatch.lastStudentCounterMutationId = schoolBefore.data()?.lastStudentCounterMutationId ?? FieldValue.delete();
              schoolPatch.lastStudentCounterMutationType = schoolBefore.data()?.lastStudentCounterMutationType ?? FieldValue.delete();
              schoolPatch.updatedAt = schoolBefore.data()?.updatedAt ?? FieldValue.delete();
              schoolPatch.updatedBy = schoolBefore.data()?.updatedBy ?? FieldValue.delete();
            }
            transaction.update(schoolRef, schoolPatch);
          }
          for (const name of ['students', 'studentPrivate', 'studentFinance', 'studentParentPrivate', 'studentParentFinance']) {
            transaction.delete(db.collection(name).doc(studentId));
          }
          if (matriculeReservationId) {
            transaction.delete(db.collection('studentMatriculeReservations').doc(matriculeReservationId));
          }
          if (duplicate && duplicate.exists) {
            const ids = Array.isArray(duplicate.data()?.studentIds) ? duplicate.data().studentIds : [];
            const remainingIds = ids.filter(id => id !== studentId);
            if (remainingIds.length === 0) transaction.delete(duplicate.ref);
            else transaction.update(duplicate.ref, { studentIds: remainingIds });
          }
        });
      }

      await deleteRefs(db, [
        secretaryUid ? db.collection('users').doc(secretaryUid) : null,
        ownerUid ? db.collection('users').doc(ownerUid) : null
      ]);
      await Promise.all([
        secretaryUid ? adminAuth.deleteUser(secretaryUid) : Promise.resolve(),
        ownerUid ? adminAuth.deleteUser(ownerUid) : Promise.resolve()
      ]);

      const residual = {
        students: studentId && (await db.collection('students').doc(studentId).get()).exists ? 1 : 0,
        privateDocs: studentId ? (await Promise.all([
          'studentPrivate', 'studentFinance', 'studentParentPrivate', 'studentParentFinance'
        ].map(name => db.collection(name).doc(studentId).get()))).filter(item => item.exists).length : 0,
        payments: studentId ? (await db.collection('payments').where('studentId', '==', studentId).get()).size : 0,
        receipts: studentId ? (await db.collection('receipts').where('studentId', '==', studentId).get()).size : 0,
        benefits: studentId ? (await db.collection('financialBenefits').where('studentId', '==', studentId).get()).size : 0,
        benefitReferences: (await Promise.all([...benefitReferenceIds].map(id =>
          db.collection('financialBenefitReferences').doc(id).get()))).filter(item => item.exists).length,
        closure: closureId && (await db.collection('cashClosures').doc(closureId).get()).exists ? 1 : 0,
        profiles: (await Promise.all([secretaryUid, ownerUid].filter(Boolean)
          .map(uid => db.collection('users').doc(uid).get()))).filter(item => item.exists).length,
        reservations: (await Promise.all([
          matriculeReservationId ? db.collection('studentMatriculeReservations').doc(matriculeReservationId).get() : null,
          duplicateReservationId ? db.collection('studentDuplicateReservations').doc(duplicateReservationId).get() : null
        ].filter(Boolean))).filter(item => item.exists).length
      };
      assert.deepEqual(residual, {
        students: 0, privateDocs: 0, payments: 0, receipts: 0, benefits: 0,
        benefitReferences: 0, closure: 0, profiles: 0, reservations: 0
      });
      for (const uid of [secretaryUid, ownerUid].filter(Boolean)) {
        await assert.rejects(() => adminAuth.getUser(uid), error => error?.code === 'auth/user-not-found');
      }
      const postInventory = await inventory(db, EXPECTED_SCHOOL);
      assert.deepEqual(postInventory.counts, preInventory.counts);
      const schoolAfter = await schoolRef.get();
      assert.equal(schoolAfter.data()?.studentsCount, schoolBefore.data()?.studentsCount);
      console.log(`POST-INVENTORY: ${JSON.stringify(postInventory)}`);
      console.log('CLEANUP RESIDUALS: 0');
      console.log('REAL DATA MODIFIED: NO');
    } catch (error) {
      cleanupError = error;
      console.error(`CLEANUP FAILURE: ${error?.message || error}`);
    } finally {
      if (secretaryClient) await deleteApp(secretaryClient.app).catch(() => undefined);
      if (ownerClient) await deleteApp(ownerClient.app).catch(() => undefined);
      await deleteAdminApp(adminApp).catch(() => undefined);
    }
    if (cleanupError) throw cleanupError;
  }
  if (testError) throw testError;
};

run().catch(error => {
  console.error(`PRODUCTION FINANCIAL E2E: FAIL (${error?.code || 'UNKNOWN'}) ${error?.message || error}`);
  process.exitCode = 1;
});
