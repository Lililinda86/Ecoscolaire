import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { chromium } from '@playwright/test';

const project = 'ecoscolaire-staging';
assert.equal(process.env.VITE_FIREBASE_PROJECT_ID, project);
assert.equal(process.env.TARGET_DEPLOYMENT_VERIFIED, 'true');
assert.match(process.env.EXPECTED_STAGING_SHA || '', /^[a-f0-9]{40}$/);
const runId = process.env.ALL_FEES_RUN_ID || '';
assert.match(runId, /^\d+-\d+$/);
const origin = new URL(process.env.STAGING_APP_URL).origin;
assert.match(origin, /^https:\/\/ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/);
assert.ok(process.env.VITE_FIREBASE_API_KEY);
const schoolId = `allfees-staging-${runId}`;
const yearId = `${schoolId}-year`, year = '2026-2027';
const app = initializeApp({ projectId: project, credential: applicationDefault() }, schoolId);
const db = getFirestore(app), auth = getAuth(app);
const tagged = { testFixture: true, testRunId: runId };
const users = {}, refs = [], students = {};
let browser;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const pass = label => console.log(`${label}: PASS`);
async function seed(collection, id, data) {
  const ref = db.collection(collection).doc(id);
  refs.push(ref);
  await ref.create({ ...data, ...tagged });
}
async function makeUser(role, foreign = false) {
  const password = randomBytes(32).toString('base64url') + '!aA1';
  const email = `allfees-${role}-${runId}${foreign ? '-foreign' : ''}@staging.ecoscolaire.test`;
  const user = await auth.createUser({ email, password, emailVerified: true });
  const record = { uid: user.uid, email, password };
  users[foreign ? 'foreign' : role] = record;
  await seed('users', user.uid, { id: user.uid, email, name: `Validation ${role}`, role, schoolId: foreign ? `${schoolId}-foreign` : schoolId, active: true, isActive: true });
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.VITE_FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, 'Test identity sign-in failed');
  assert.ok(body.idToken);
  record.token = body.idToken;
}
async function call(name, data, role = 'secretary') {
  const response = await fetch(`https://us-central1-${project}.cloudfunctions.net/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${users[role].token}` },
    body: JSON.stringify({ data: { schoolId, ...data } })
  });
  assert.notEqual(response.status, 404, `${name} must be deployed`);
  const body = await response.json();
  if (!response.ok || body.error) {
    const error = new Error(`${name}: ${body.error?.message || response.status}`);
    error.status = body.error?.status;
    throw error;
  }
  return body.result;
}
const account = studentId => call('getStudentFinancialAccount', { studentId, academicYear: year, monthlyTransport: true });
const denied = promise => assert.rejects(promise, error => error.status === 'PERMISSION_DENIED');

try {
  await seed('schools', schoolId, { id: schoolId, name: 'Validation tous frais Staging', academicYear: year, activeAcademicYearId: yearId,
    active: true, subscriptionStatus: 'active', studentsCount: 6, studentLimit: 30,
    classFees: Object.fromEntries(['Maternelle', 'CP', 'Form 1'].map(name => [name, { registration: 15000, tuition: 150000, t1: 60000, t2: 50000, t3: 40000 }])),
    transportPolicy: { feePolicyId: 'ITALO_PK_2026', billingPeriods: ['2026-09', '2026-10', '2026-11'] } });
  await seed('academicYears', yearId, { schoolId, name: year, status: 'active', tuitionPaymentDeadlines: { T1: '2026-09-05', T2: '2027-01-10', T3: '2027-04-10' } });
  await makeUser('secretary'); await makeUser('director'); await makeUser('secretary', true);
  for (const [cycle, name] of [['nursery', 'Maternelle'], ['primary', 'CP'], ['secondary', 'Form 1']]) {
    const classId = `${schoolId}-${cycle}`;
    await seed('classes', classId, { id: classId, schoolId, name, cycle, level: cycle, academicYearId: yearId });
    for (const pk of [18, 36]) {
      const id = `${classId}-${pk}`; students[`${cycle}${pk}`] = id;
      await seed('students', id, { id, schoolId, classId, academicYearId: yearId, academicYear: year, usesTransport: cycle === 'primary',
        name: `ALLFEES ${cycle} PK${pk}`, matricule: `AF-${cycle}-${pk}`, schoolingStatus: 'active', gender: 'M', section: 'francophone' });
      await seed('studentPrivate', id, { id, studentId: id, schoolId, transportZonePk: pk });
      await seed('studentFinance', id, { id, studentId: id, schoolId, registrationFeeExpected: 15000, registrationFeePaid: 0, feeT1: 0, feeT2: 0, feeT3: 0 });
      const before = await account(id);
      if (cycle !== 'primary') assert.equal(before.lines.some(line => line.type === 'transport'), false);
      const plan = await call('setStudentTransportPlan', { studentId: id, usesTransport: true, zonePk: pk });
      const amount = cycle === 'secondary' ? 0 : pk === 18 ? 4000 : 5000;
      assert.equal(plan.monthlyGrossAmount, amount);
      const lines = (await account(id)).lines.filter(line => line.type === 'transport');
      if (cycle === 'secondary') assert.equal(lines.length, 0);
      else {
        assert.ok(lines.length > 0); assert.ok(lines.every(line => line.grossExpectedAmount === amount));
        if (cycle === 'nursery') assert.ok(lines.every(line => line.period >= plan.effectivePeriod));
      }
      pass(`${cycle.toUpperCase()} PK${pk}`);
    }
  }
  const studentId = students.primary18;
  await denied(call('getStudentFinancialAccount', { studentId, academicYear: year }, 'foreign'));
  const categories = ['uniform', 'sports_uniform', 'books', 'supplies', 'exam', 'canteen', 'activity', 'excursion', 'event', 'photo', 'contribution', 'exceptional', 'other'];
  for (const category of categories) {
    const fee = { label: `TEST ${category}`, category, amount: 15000, description: 'Fixture isolée Staging', academicYear: year,
      mandatory: category !== 'excursion', dueDate: '2027-06-15', classIds: [], cycles: ['primary'], studentIds: [] };
    const payload = { action: 'create', feeId: `${schoolId}-${category}`, fee };
    await denied(call('manageSchoolFee', payload));
    await call('manageSchoolFee', payload, 'director');
    assert.equal((await call('manageSchoolFee', payload, 'director')).replay, true);
  }
  assert.equal((await account(studentId)).lines.filter(line => line.type === 'other').length, 12);
  const assign = { action: 'assign', feeId: `${schoolId}-excursion`, studentId };
  await call('manageSchoolFee', assign, 'director');
  assert.equal((await call('manageSchoolFee', assign, 'director')).replay, true);
  let snapshot = await account(studentId);
  assert.equal(snapshot.lines.filter(line => line.type === 'other').length, 13);
  for (const key of ['registration_fee', 'tuition:T1', 'tuition:T2', 'tuition:T3']) assert.ok(snapshot.lines.some(line => line.key === key));
  pass('CATALOGUE / OPTIONAL / EVENTS / EXCURSIONS / INSCRIPTION / T1 T2 T3');

  const benefit = await call('createFinancialBenefit', { requestId: `benefit-${runId}`, studentId, academicYear: year, benefitType: 'SCHOLARSHIP',
    paymentType: 'TUITION', mode: 'FIXED_AMOUNT', value: 10000, installment: 'T1', stackable: true, reason: 'Fixture Staging', maximumUses: 1 });
  assert.equal(benefit.status, 'draft');
  assert.equal((await account(studentId)).lines.find(line => line.key === 'tuition:T1').netExpectedAmount, 60000);
  await call('submitFinancialBenefit', { benefitId: benefit.benefitId });
  assert.equal((await account(studentId)).lines.find(line => line.key === 'tuition:T1').netExpectedAmount, 60000);
  await denied(call('approveFinancialBenefit', { benefitId: benefit.benefitId }));
  await denied(call('rejectFinancialBenefit', { benefitId: benefit.benefitId, reason: 'Fixture' }));
  await call('approveFinancialBenefit', { benefitId: benefit.benefitId }, 'director');
  assert.equal((await account(studentId)).lines.find(line => line.key === 'tuition:T1').netExpectedAmount, 50000);
  pass('SECRETARY WORKFLOW / DIRECTOR APPROVAL / APPROVED-ONLY IMPACT');
  const moratorium = await call('createPaymentMoratorium', { requestId: `moratorium-${runId}`, studentId, academicYear: year,
    paymentType: 'tuition', installment: 'T2', effectiveDueDate: '2027-02-10', reason: 'Fixture Staging' });
  await call('submitPaymentMoratorium', { moratoriumId: moratorium.moratoriumId });
  assert.equal((await account(studentId)).lines.find(line => line.key === 'tuition:T2').effectiveDueDate, '2027-01-10');
  await denied(call('approvePaymentMoratorium', { moratoriumId: moratorium.moratoriumId }));
  await call('approvePaymentMoratorium', { moratoriumId: moratorium.moratoriumId }, 'director');
  const postponed = (await account(studentId)).lines.find(line => line.key === 'tuition:T2');
  assert.equal(postponed.effectiveDueDate, '2027-02-10'); assert.equal(postponed.netExpectedAmount, 50000);
  pass('MORATORIUM');

  const transport = snapshot.lines.find(line => line.type === 'transport');
  const feeId = `${schoolId}-uniform`;
  const paymentInput = { requestId: `pay-${runId}`, studentId, academicYear: year,
    allocations: [{ type: 'registration_fee', amount: 10000 }, { type: 'transport', period: transport.period, amount: 4000 }, { type: 'other', feeId, amount: 5000 }] };
  const payment = await call('recordCashCollection', paymentInput);
  assert.equal(payment.amount, 19000); assert.equal(payment.lineItems.length, 3);
  assert.equal((await call('recordCashCollection', paymentInput)).idempotentReplay, true);
  await denied(call('recordCashCollection', paymentInput, 'foreign'));
  assert.equal((await account(studentId)).lines.find(line => line.feeId === feeId).remainingBalance, 10000);
  const receipt = await db.collection('receipts').doc(payment.receiptId).get();
  assert.equal(receipt.data().schoolId, schoolId); assert.equal(receipt.data().amount, 19000);
  await assert.rejects(call('recordCashCollection', { ...paymentInput, requestId: `overpay-${runId}`, allocations: [{ type: 'other', feeId, amount: 10001 }] }));
  await call('setStudentTransportPlan', { studentId, usesTransport: true, zonePk: 36 });
  const historical = (await account(studentId)).lines.find(line => line.key === transport.key);
  assert.equal(historical.grossExpectedAmount, 4000); assert.match(historical.label, /PK18/);
  pass('MULTI-FEE / PARTIAL PAYMENT / RECEIPT / IDEMPOTENCY / HISTORICAL RATE');
  const legacyStudent = students.secondary18;
  const legacy = await call('recordCashPayment', { requestId: `legacy-${runId}`, studentId: legacyStudent, academicYear: year,
    type: 'tuition', installment: 'T3', amount: 1000 });
  assert.equal((await account(legacyStudent)).lines.find(line => line.key === 'tuition:T3').previousPaid, 1000);
  const legacyReceipt = await db.collection('receipts').doc(legacy.receiptId).get();
  assert.equal(legacyReceipt.data().schoolId, schoolId);
  assert.equal(legacyReceipt.data().amount, 1000);
  assert.ok(legacyReceipt.data().receiptNumber);
  pass('LEGACY PAYMENTS / LEGACY RECEIPTS');
  await call('recordCashCollection', { requestId: `retained-${runId}`, studentId, academicYear: year,
    allocations: [{ type: 'tuition', installment: 'T3', amount: 1000 }] });

  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) await page.route(`${origin}/**`, route => route.continue({ headers: { ...route.request().headers(),
    'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' } }));
  await page.goto(`${origin}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email').fill(users.secretary.email);
  await page.getByTestId('login-password').fill(users.secretary.password);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 45000 });
  await page.goto(`${origin}/#/payments`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('open-cash-payment').click();
  await page.getByTestId('cash-payment-student').selectOption(studentId);
  await page.getByRole('heading', { name: 'Frais à régler', exact: true }).waitFor({ timeout: 30000 });
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByText('TEST excursion', { exact: true }).first().waitFor();
    // All relevant controls must remain inside the viewport; no horizontal page overflow.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    assert.equal(await page.getByTestId('cash-payment-student').isVisible(), true);
    assert.equal(await page.locator('.collection-basket').isVisible(), true);
    if (width === 1440) {
      const left = await page.locator('.obligations').boundingBox(), right = await page.locator('.collection-basket').boundingBox();
      assert.ok(left && right && right.x >= left.x + left.width - 1, 'desktop panels must be side by side');
    }
    await page.screenshot({ path: `all-fees-${width}.png`, fullPage: true });
    pass(`RESPONSIVE ${width}`);
  }
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/getStudentFinancialAccount') && response.request().postDataJSON()?.data?.studentId === students.secondary18),
    page.getByTestId('cash-payment-student').selectOption(students.secondary18)
  ]);
  await page.locator('.student-identity').getByText('ALLFEES secondary PK18', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  pass('ENCAISSEMENT UI / STUDENT SWITCH');
  await browser.close(); browser = undefined;
  await call('manageSchoolFee', { action: 'archive', feeId }, 'director');
  assert.equal((await account(studentId)).lines.find(line => line.feeId === feeId).remainingBalance, 10000);
  await call('reverseCashCollection', { collectionId: payment.collectionId, requestId: `reverse-${runId}`, reason: 'Nettoyage du test Staging' }, 'director');
  assert.equal((await account(studentId)).lines.find(line => line.feeId === feeId).remainingBalance, 15000);
  await pause(3000);
  assert.equal((await db.collection('studentFinance').doc(studentId).get()).data().tuitionPaid, 1000,
    'another V3 payment remains reflected after an atomic reversal');
  pass('ARCHIVE / REVERSAL');
  console.log('STAGING FUNCTIONAL: PASS');
} finally {
  if (browser) await browser.close();
  const collections = ['studentFeeAssignments', 'studentTransportPlans', 'financialBenefits', 'paymentMoratoriums', 'payments', 'receipts',
    'paymentAllocations', 'transportPaymentAllocations', 'audit_logs', 'cashLedgerDays', 'cashClosures', 'studentPrivate', 'studentFinance',
    'studentParentPrivate', 'studentParentFinance', 'students', 'classes', 'academicYears'];
  // Allow fixture-only async projections to finish, then remove only this run's school data.
  await pause(5000);
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const collection of collections) {
      const docs = await db.collection(collection).where('schoolId', '==', schoolId).get();
      for (const doc of docs.docs) { assert.equal(doc.data().schoolId, schoolId); await doc.ref.delete(); }
    }
    await pause(2000);
  }
  await db.collection('counters').doc(`receipts_${schoolId}`).delete();
  for (const ref of refs.reverse()) {
    const snap = await ref.get();
    if (snap.exists) { assert.equal(snap.data().testRunId, runId); await ref.delete(); }
  }
  for (const user of Object.values(users)) await auth.deleteUser(user.uid);
  for (const collection of collections) assert.equal((await db.collection(collection).where('schoolId', '==', schoolId).get()).size, 0, collection);
  for (const user of Object.values(users)) await assert.rejects(auth.getUser(user.uid), error => error.code === 'auth/user-not-found');
  console.log('CLEANUP: PASS\nRESIDUALS: 0 (isolated test school)\nORPHANS: 0 (isolated test school)\nPRODUCTION TOUCHED: NO');
  await deleteApp(app);
}
