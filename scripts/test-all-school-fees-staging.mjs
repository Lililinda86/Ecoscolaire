import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { chromium, expect } from '@playwright/test';

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
    feeCatalog: [{ id: 'legacy-test', label: 'Frais historique TEST', amount: 2500, cycles: ['secondary'], active: true }],
    active: true, subscriptionStatus: 'active', studentsCount: 6, studentLimit: 30,
    classFees: Object.fromEntries(['Maternelle Petite Section', 'CP', 'Form 1'].map(name => [name, { registration: 15000, tuition: 150000, t1: 60000, t2: 50000, t3: 40000 }])),
    transportPolicy: { feePolicyId: 'ITALO_PK_2026', billingPeriods: ['2026-09', '2026-10', '2026-11'] } });
  await seed('academicYears', yearId, { schoolId, name: year, status: 'active', tuitionPaymentDeadlines: { T1: '2026-09-05', T2: '2027-01-10', T3: '2027-04-10' } });
  await makeUser('secretary'); await makeUser('director'); await makeUser('secretary', true);
  for (const [cycle, name] of [['nursery', 'Maternelle Petite Section'], ['primary', 'CP'], ['secondary', 'Form 1']]) {
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
      const plan = await call('setStudentTransportPlan', { studentId: id, usesTransport: true });
      assert.equal((await db.collection('studentPrivate').doc(id).get()).data().transportZonePk, pk);
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
  for (const [key, name, active] of [['ms', 'Maternelle Moyenne Section', true], ['gs', 'Maternelle Grande Section', true], ['en', 'Nursery 2', true], ['old', 'Maternelle 2', false]]) {
    await seed('classes', `${schoolId}-${key}`, { schoolId, name, cycle: 'nursery', academicYearId: yearId, isActive: active });
  }
  students.nurseryMS = `${schoolId}-ms-student`;
  await seed('students', students.nurseryMS, { schoolId, classId: `${schoolId}-ms`, academicYearId: yearId, academicYear: year, usesTransport: false, name: 'ALLFEES Maternelle MS', matricule: 'AF-MS', schoolingStatus: 'active', gender: 'F', section: 'francophone' });
  await seed('studentPrivate', students.nurseryMS, { schoolId, studentId: students.nurseryMS, transportZonePk: null });
  await seed('studentFinance', students.nurseryMS, { schoolId, studentId: students.nurseryMS, registrationFeeExpected: 15000 });
  const studentId = students.primary18;
  await denied(call('getStudentFinancialAccount', { studentId, academicYear: year }, 'foreign'));
  const categories = ['uniform', 'sports_uniform', 'books', 'supplies', 'exam', 'canteen', 'childcare', 'activity', 'excursion', 'event', 'photo', 'contribution', 'exceptional', 'other'];
  for (const category of categories) {
    const fee = { label: category === 'other' ? 'Cérémonie de fin d’année TEST' : `TEST ${category}`, category, amount: 15000, description: 'Fixture isolée Staging', academicYear: year,
      mandatory: category !== 'excursion', dueDate: '2027-06-15', classIds: [], cycles: ['primary'], studentIds: [] };
    const payload = { action: 'create', feeId: `${schoolId}-${category}`, fee };
    await denied(call('manageSchoolFee', payload));
    await call('manageSchoolFee', payload, 'director');
    assert.equal((await call('manageSchoolFee', payload, 'director')).replay, true);
  }
  assert.equal((await account(studentId)).lines.filter(line => line.type === 'other').length, 13);
  const assign = { action: 'assign', feeId: `${schoolId}-excursion`, studentId };
  await call('manageSchoolFee', assign, 'director');
  assert.equal((await call('manageSchoolFee', assign, 'director')).replay, true);
  let snapshot = await account(studentId);
  assert.equal(snapshot.lines.filter(line => line.type === 'other').length, 14);
  for (const key of ['registration_fee', 'tuition:T1', 'tuition:T2', 'tuition:T3']) assert.ok(snapshot.lines.some(line => line.key === key));
  assert.equal(snapshot.lines.find(line => line.feeId === `${schoolId}-other`).label, 'Cérémonie de fin d’année TEST');
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
  const customFeeId = `${schoolId}-other`;
  const customPayment = await call('recordCashCollection', { requestId: `custom-label-${runId}`, studentId, academicYear: year,
    allocations: [{ type: 'other', feeId: customFeeId, amount: 1000 }] });
  assert.equal(customPayment.lineItems[0].label, 'Cérémonie de fin d’année TEST');
  const customReceipt = await db.collection('receipts').doc(customPayment.receiptId).get();
  assert.equal(customReceipt.data().lineItems[0].label, 'Cérémonie de fin d’année TEST');
  assert.equal((await account(studentId)).lines.find(line => line.feeId === customFeeId).remainingBalance, 14000);
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
  const previewContext = await browser.newContext();
  const previewPage = await previewContext.newPage();
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) await previewPage.route(`${origin}/**`, route => route.continue({ headers: { ...route.request().headers(),
    'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' } }));
  await previewPage.goto(`${origin}/#/login`);
  await previewPage.getByTestId('login-email').fill(users.secretary.email);
  await previewPage.getByTestId('login-password').fill(users.secretary.password);
  await previewPage.getByTestId('login-submit').click();
  await previewPage.getByTestId('sidebar').waitFor({ timeout: 45000 });
  await previewPage.goto(`${origin}/#/settings`);
  const transportCard = previewPage.getByRole('region', { name: 'Transport', exact: true });
  await expect(transportCard).toContainText(/4\s*000\s*FCFA/);
  await expect(transportCard).toContainText(/5\s*000\s*FCFA/);
  await expect(previewPage.getByText('Maternelle Moyenne Section', { exact: true })).toBeVisible();
  await previewPage.screenshot({ path: 'all-fees-transport-defaults.png', fullPage: true });
  await previewContext.close();
  pass('TRANSPORT DEFAULT 4000 / 5000 VISIBLE WITHOUT STORED PK RATES');
  const schoolBeforeRevision = (await db.collection('schools').doc(schoolId).get()).data();
  const revised = { globalFees: { feeT1: 0, feeT2: 0, feeT3: 0, feeTransport: 0, feeUniforms: 0 },
    classFees: structuredClone(schoolBeforeRevision.classFees),
    transportPolicy: { ...schoolBeforeRevision.transportPolicy, pkRates: { pk14To33: 4500, pk34To42: 5500 }, billingPeriods: [...schoolBeforeRevision.transportPolicy.billingPeriods, '2026-12'] } };
  revised.classFees.CP.t1 = 65000; revised.classFees.CP.tuition = 155000;
  const reviseTariffs = { action: 'configure', academicYear: year, expectedVersion: null, reason: 'Validation isolée des snapshots', configuration: revised };
  await denied(call('manageSchoolFee', reviseTariffs));
  await call('manageSchoolFee', reviseTariffs, 'director');
  const afterRevision = await account(studentId);
  assert.equal(afterRevision.lines.find(l => l.key === 'tuition:T1').grossExpectedAmount, 60000);
  assert.equal(afterRevision.lines.find(l => l.key === 'tuition:T1').netExpectedAmount, 50000);
  assert.equal(afterRevision.lines.find(l => l.key === transport.key).grossExpectedAmount, 4000);
  assert.equal(afterRevision.lines.find(l => l.key === 'transport:2026-12').grossExpectedAmount, 5500);
  assert.equal(afterRevision.lines.find(l => l.key === 'tuition:T2').effectiveDueDate, '2027-02-10');
  await call('manageSchoolFee', { action: 'revise', feeId, expectedAmount: 15000, amount: 18000, reason: 'Nouvelle version test' }, 'director');
  assert.equal((await account(studentId)).lines.find(l => l.feeId === feeId).grossExpectedAmount, 15000);
  const newStudentId = `${schoolId}-new-obligation`;
  await seed('students', newStudentId, { id: newStudentId, schoolId, classId: `${schoolId}-primary`, academicYearId: yearId, academicYear: year,
    usesTransport: false, name: 'ALLFEES Nouvelle obligation', matricule: 'AF-NEW', schoolingStatus: 'active', gender: 'M', section: 'francophone' });
  await seed('studentPrivate', newStudentId, { id: newStudentId, studentId: newStudentId, schoolId, transportZonePk: null });
  await seed('studentFinance', newStudentId, { id: newStudentId, studentId: newStudentId, schoolId, registrationFeeExpected: 15000 });
  const newAccount = await account(newStudentId);
  assert.equal(newAccount.lines.find(l => l.key === 'tuition:T1').grossExpectedAmount, 65000);
  assert.equal(newAccount.lines.find(l => l.feeId === feeId).grossExpectedAmount, 18000);
  assert.equal(newAccount.lines.some(l => l.type === 'transport'), false);
  await db.collection('students').doc(studentId).update({ classId: `${schoolId}-nursery` });
  assert.equal((await account(studentId)).lines.find(l => l.key === 'tuition:T1').grossExpectedAmount, 60000);
  await db.collection('students').doc(studentId).update({ classId: `${schoolId}-primary` });
  assert.deepEqual((await db.collection('receipts').doc(payment.receiptId).get()).data(), receipt.data());
  pass('TARIFF VERSIONS / IMMUTABLE TUITION / NEW OBLIGATIONS / IMMUTABLE TRANSPORT / IMMUTABLE UNIFORMS / CLASS CHANGE / NO TRANSPORT');
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
    if (width <= 640) {
      const navigation = page.getByTestId('sidebar');
      if ((await navigation.getAttribute('class')).includes('sidebar-open')) {
        await navigation.locator('.sidebar-close-button').click();
      }
      // Resizing from desktop animates the closed drawer out; do not capture an intermediate frame.
      await expect(navigation).not.toBeInViewport();
    }
    const amountInput = page.getByLabel('Montant reçu pour TEST excursion', { exact: true });
    const group = amountInput.locator('xpath=ancestor::details[contains(@class,"account-fee-group")]');
    if (await group.count() && !(await group.getAttribute('open') !== null)) await group.locator('summary').first().click();
    await amountInput.fill('1000');
    await expect(page.getByTestId('cash-payment-submit')).toBeEnabled();
    await amountInput.fill('');
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
  await page.getByTestId('cash-payment-student').selectOption(studentId);
  const uiAmount = page.getByLabel('Montant reçu pour TEST excursion', { exact: true });
  await uiAmount.waitFor({ state: 'attached', timeout: 30000 });
  const uiGroup = uiAmount.locator('xpath=ancestor::details[contains(@class,"account-fee-group")]');
  if (await uiGroup.getAttribute('open') === null) await uiGroup.locator('summary').first().click();
  await uiAmount.fill('1000');
  await page.getByTestId('cash-payment-submit').click();
  await page.getByRole('heading', { name: 'Encaissement enregistré ✓', exact: true }).waitFor({ timeout: 30000 });
  await expect(page.locator('.student-account-receipt')).toContainText('Validation secretary');
  await expect(page.locator('.student-account-receipt')).toContainText('Matricule');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger PDF' }).click();
  const download = await downloadPromise;
  assert.equal(await download.failure(), null);
  await download.saveAs('all-fees-receipt.pdf');
  assert.equal((await account(studentId)).lines.find(l => l.feeId === `${schoolId}-excursion`).previousPaid, 1000);
  pass('AUTOMATIC RECEIPT UI / PDF DOWNLOAD / UI PARTIAL PAYMENT');
  await page.goto(`${origin}/#/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Paramètres financiers', exact: true }).waitFor({ timeout: 30000 });
  await expect(page.getByTestId('nav-settings')).toContainText('Tarifs financiers');
  await expect(page.getByRole('button', { name: 'Enregistrer les tarifs', exact: true })).toHaveCount(0);
  await expect(page.getByText('Campay Secret', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Audit Logs', { exact: true })).toHaveCount(0);
  for (const heading of ['Tenues', 'Activités / événements', 'Autres frais', 'Frais ponctuels']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByText('TEST sports_uniform', { exact: true })).toBeVisible({ timeout: 30000 });
  const availableTypes = await page.locator('.school-fee-types').allTextContents();
  for (const label of ['Tenue scolaire', 'Tenue de sport', 'Tenue de cérémonie', 'Autre type de tenue',
    "Kit d’activités", "Fête de l’école", 'Excursion', 'Sortie pédagogique', 'Photos scolaires',
    'Activité culturelle', 'Fournitures / supports', 'Autre libellé libre']) {
    assert.ok(availableTypes.some(text => text.includes(label)), `missing catalogue subtype: ${label}`);
  }
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 640) {
      const sidebar = page.getByTestId('sidebar');
      if ((await sidebar.getAttribute('class')).includes('sidebar-open')) await sidebar.locator('.sidebar-close-button').click();
      await expect(sidebar).not.toBeInViewport();
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: `all-fees-secretary-settings-${width}.png`, fullPage: true });
  }
  pass('SECRETARY FINANCIAL SETTINGS READ-ONLY / 360 / 768 / 1440');
  const directorContext = await browser.newContext();
  const settingsPage = await directorContext.newPage();
  settingsPage.on('pageerror', error => errors.push(error.message));
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) await settingsPage.route(`${origin}/**`, route => route.continue({ headers: { ...route.request().headers(),
    'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' } }));
  await settingsPage.goto(`${origin}/#/login`, { waitUntil: 'domcontentloaded' });
  await settingsPage.getByTestId('login-email').fill(users.director.email);
  await settingsPage.getByTestId('login-password').fill(users.director.password);
  await settingsPage.getByTestId('login-submit').click();
  await settingsPage.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 45000 });
  await settingsPage.goto(`${origin}/#/settings`, { waitUntil: 'domcontentloaded' });
  await settingsPage.getByRole('navigation', { name: 'Sections des paramètres' }).waitFor({ timeout: 30000 });
  await settingsPage.getByRole('navigation', { name: 'Sections des paramètres' }).getByRole('button', { name: 'Finances & tarifs', exact: true }).click();
  // Exercise the exact nursery workflow, including implicit scope and actual deselection.
  await settingsPage.getByText('Créer un nouveau frais', { exact: true }).click();
  const nurseryCycles = settingsPage.getByRole('group', { name: 'Cycles concernés', exact: true });
  const nurseryClasses = settingsPage.getByRole('group', { name: 'Classes concernées', exact: true });
  const nurseryStudents = settingsPage.getByRole('group', { name: 'Élèves concernés', exact: true });
  await expect(nurseryClasses.getByRole('checkbox')).toHaveCount(7);
  await expect(nurseryStudents.getByRole('checkbox')).toHaveCount(9);
  await settingsPage.getByLabel('Type de frais').selectOption('exam');
  await settingsPage.getByLabel('Libellé précis du frais', { exact: true }).fill('Examen maternelle TEST');
  await settingsPage.getByLabel('Montant (FCFA)', { exact: true }).fill('10000');
  await nurseryCycles.getByRole('checkbox', { name: 'Maternelle', exact: true }).check();
  await expect(nurseryClasses.getByRole('checkbox')).toHaveCount(5);
  await expect(nurseryStudents.getByRole('checkbox')).toHaveCount(4);
  await expect(nurseryClasses.getByRole('checkbox', { name: 'CP', exact: true })).toHaveCount(0);
  await nurseryClasses.getByRole('checkbox', { name: 'Maternelle Petite Section', exact: true }).check();
  await expect(nurseryStudents.getByRole('checkbox')).toHaveCount(3);
  await nurseryClasses.getByRole('checkbox', { name: 'Maternelle Moyenne Section', exact: true }).check();
  await nurseryStudents.getByRole('checkbox', { name: 'ALLFEES Maternelle MS — AF-MS', exact: true }).check();
  await nurseryStudents.getByRole('checkbox', { name: 'ALLFEES nursery PK18 — AF-nursery-18', exact: true }).check();
  await nurseryClasses.getByRole('checkbox', { name: 'Maternelle Moyenne Section', exact: true }).uncheck();
  await expect(nurseryStudents.getByRole('checkbox', { name: 'ALLFEES Maternelle MS — AF-MS', exact: true })).toHaveCount(0);
  await nurseryClasses.getByRole('button', { name: 'Tout désélectionner — classes', exact: true }).click();
  await expect(nurseryStudents.getByRole('checkbox')).toHaveCount(4);
  await nurseryStudents.getByRole('button', { name: 'Tout désélectionner — élèves', exact: true }).click();
  await nurseryCycles.getByRole('button', { name: 'Tout sélectionner — cycles', exact: true }).click();
  await expect(nurseryClasses.getByRole('checkbox')).toHaveCount(7);
  await nurseryCycles.getByRole('button', { name: 'Tout désélectionner — cycles', exact: true }).click();
  await expect(nurseryClasses.getByRole('checkbox')).toHaveCount(7);
  await expect(nurseryStudents.getByRole('checkbox')).toHaveCount(9);
  await nurseryCycles.getByRole('checkbox', { name: 'Maternelle', exact: true }).check();
  await nurseryClasses.getByRole('searchbox').fill('Petite');
  await expect(nurseryClasses.getByRole('checkbox')).toHaveCount(2);
  await nurseryClasses.getByRole('searchbox').fill('');
  await nurseryClasses.getByRole('checkbox', { name: 'Maternelle Petite Section', exact: true }).check();
  await nurseryStudents.getByRole('checkbox', { name: 'Tout sélectionner — élèves', exact: true }).check();
  await nurseryStudents.getByRole('button', { name: 'Tout désélectionner — élèves', exact: true }).click();
  await nurseryStudents.getByRole('checkbox', { name: 'ALLFEES nursery PK18 — AF-nursery-18', exact: true }).check();
  await settingsPage.getByRole('button', { name: 'Vérifier avant publication', exact: true }).click();
  await expect(settingsPage.getByRole('region', { name: 'Résumé avant publication' })).toContainText('Élèves concernés : 1');
  for (const width of [360, 768, 1440]) {
    await settingsPage.setViewportSize({ width, height: 1000 });
    if (width <= 640) {
      const sidebar = settingsPage.getByTestId('sidebar');
      if ((await sidebar.getAttribute('class')).includes('sidebar-open')) await sidebar.locator('.sidebar-close-button').click();
      await expect(sidebar).not.toBeInViewport();
    }
    assert.equal(await settingsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await settingsPage.screenshot({ path: `all-fees-nursery-targets-${width}.png`, fullPage: true });
  }
  await settingsPage.getByRole('button', { name: 'Publier le frais', exact: true }).click();
  await expect.poll(async () => (await db.collection('schools').doc(schoolId).get()).data().feeCatalog.some(f => f.label === 'Examen maternelle TEST')).toBe(true);
  const nurseryFee = (await db.collection('schools').doc(schoolId).get()).data().feeCatalog.find(f => f.label === 'Examen maternelle TEST');
  assert.deepEqual(nurseryFee.studentIds, [students.nursery18]);
  for (const outside of [students.nursery36, students.nurseryMS, students.primary18, students.secondary18]) assert.equal((await account(outside)).lines.some(l => l.feeId === nurseryFee.id), false);
  await page.goto(`${origin}/#/payments`);
  await page.getByTestId('open-cash-payment').click();
  await page.getByTestId('cash-payment-student').selectOption(students.nursery18);
  const nurseryAmount = page.getByLabel('Montant reçu pour Examen maternelle TEST', { exact: true });
  await nurseryAmount.waitFor({ state: 'attached', timeout: 30000 });
  const nurseryGroup = nurseryAmount.locator('xpath=ancestor::details[contains(@class,"account-fee-group")]');
  await expect(nurseryGroup.locator('summary')).toContainText('Frais ponctuels');
  if (await nurseryGroup.getAttribute('open') === null) await nurseryGroup.locator('summary').first().click();
  await nurseryAmount.fill('10000');
  await page.getByTestId('cash-payment-submit').click();
  await page.getByRole('heading', { name: 'Encaissement enregistré ✓', exact: true }).waitFor({ timeout: 30000 });
  const nurseryPaid = (await account(students.nursery18)).lines.find(l => l.feeId === nurseryFee.id);
  assert.equal(nurseryPaid.grossExpectedAmount, 10000); assert.equal(nurseryPaid.previousPaid, 10000); assert.equal(nurseryPaid.remainingBalance, 0);
  await page.screenshot({ path: 'all-fees-nursery-paid-in-full.png', fullPage: true });
  pass('NURSERY CLICK CASCADE / MULTI SELECT DESELECT / PUBLICATION / ONE-OFF GROUP / PAID IN FULL');

  // Persist each empty-scope combination and verify actual accounts, not only DOM presence.
  for (const scope of [
    { label: 'Tous périmètres TEST', cycle: null, cls: null, included: [students.nursery18, students.primary36, students.secondary18], excluded: [] },
    { label: 'Toutes classes maternelles TEST', cycle: 'Maternelle', cls: null, included: [students.nursery18, students.nurseryMS], excluded: [students.primary36, students.secondary18] },
    { label: 'CP tous élèves TEST', cycle: null, cls: 'CP', included: [students.primary18, students.primary36, newStudentId], excluded: [students.nursery18, students.secondary18] }
  ]) {
    await settingsPage.getByRole('button', { name: 'Ajouter un frais', exact: true }).click();
    await settingsPage.getByLabel('Libellé précis du frais', { exact: true }).fill(scope.label);
    await settingsPage.getByLabel('Montant (FCFA)', { exact: true }).fill('1200');
    if (scope.cycle) await nurseryCycles.getByRole('checkbox', { name: scope.cycle, exact: true }).check();
    if (scope.cls) await nurseryClasses.getByRole('checkbox', { name: scope.cls, exact: true }).check();
    await settingsPage.getByRole('button', { name: 'Vérifier avant publication', exact: true }).click();
    await settingsPage.getByRole('button', { name: 'Publier le frais', exact: true }).click();
    await expect.poll(async () => (await db.collection('schools').doc(schoolId).get()).data().feeCatalog.some(f => f.label === scope.label)).toBe(true);
    const scoped = (await db.collection('schools').doc(schoolId).get()).data().feeCatalog.find(f => f.label === scope.label);
    if (!scope.cycle) assert.deepEqual(scoped.cycles, []);
    if (!scope.cls) assert.deepEqual(scoped.classIds, []);
    assert.deepEqual(scoped.studentIds, []);
    for (const included of scope.included) assert.equal((await account(included)).lines.find(l => l.feeId === scoped.id).grossExpectedAmount, 1200);
    for (const excluded of scope.excluded) assert.equal((await account(excluded)).lines.some(l => l.feeId === scoped.id), false);
  }
  pass('EMPTY CYCLE / EMPTY CLASS / EMPTY STUDENT SCOPES PUBLISHED AND APPLIED CORRECTLY');
  await settingsPage.getByRole('button', { name: 'Ajouter un frais', exact: true }).click();
  await settingsPage.getByLabel('Type de frais').selectOption('excursion');
  await settingsPage.getByLabel('Libellé précis du frais', { exact: true }).fill('Sortie MS facultative TEST');
  await settingsPage.getByLabel('Montant (FCFA)', { exact: true }).fill('2000');
  await settingsPage.getByLabel('Obligatoire pour les élèves concernés').uncheck();
  await nurseryCycles.getByRole('checkbox', { name: 'Maternelle', exact: true }).check();
  await nurseryClasses.getByRole('checkbox', { name: 'Maternelle Moyenne Section', exact: true }).check();
  await settingsPage.getByRole('button', { name: 'Vérifier avant publication', exact: true }).click();
  await settingsPage.getByRole('button', { name: 'Publier le frais', exact: true }).click();
  await expect.poll(async () => (await db.collection('schools').doc(schoolId).get()).data().feeCatalog.some(f => f.label === 'Sortie MS facultative TEST')).toBe(true);
  const optionalFee = (await db.collection('schools').doc(schoolId).get()).data().feeCatalog.find(f => f.label === 'Sortie MS facultative TEST');
  assert.equal((await account(students.nurseryMS)).lines.some(l => l.feeId === optionalFee.id), false);
  await settingsPage.getByLabel('Frais facultatif', { exact: true }).selectOption(optionalFee.id);
  const eligibleOptional = settingsPage.getByLabel('Élève concerné', { exact: true });
  await expect(eligibleOptional.locator('option')).toHaveCount(2);
  await eligibleOptional.selectOption(students.nurseryMS);
  await settingsPage.getByRole('button', { name: 'Affecter à l’élève', exact: true }).click();
  await expect.poll(async () => (await account(students.nurseryMS)).lines.find(l => l.feeId === optionalFee.id)?.grossExpectedAmount).toBe(2000);
  assert.equal((await account(students.nursery18)).lines.some(l => l.feeId === optionalFee.id), false);
  pass('OPTIONAL FEE UI / NO AUTOMATIC DEBT / FILTERED EXPLICIT ASSIGNMENT');

  await expect(settingsPage.getByRole('button', { name: 'Ajouter — Tenues', exact: true })).toBeVisible();
  await settingsPage.getByRole('button', { name: 'Ajouter — Autres frais', exact: true }).click();
  const feeType = settingsPage.getByLabel('Type de frais');
  for (const option of ['uniform', 'sports_uniform', 'ceremony_uniform', 'other_uniform', 'activity_kit', 'event', 'excursion',
    'school_trip', 'cultural_activity', 'photo', 'supplies', 'other']) await expect(feeType.locator(`option[value="${option}"]`)).toHaveCount(1);
  const targetClasses = settingsPage.getByRole('group', { name: 'Classes concernées', exact: true });
  const targetStudents = settingsPage.getByRole('group', { name: 'Élèves concernés', exact: true });
  await settingsPage.getByRole('group', { name: 'Cycles concernés', exact: true }).getByRole('checkbox', { name: 'Maternelle', exact: true }).check();
  await expect(targetClasses.getByRole('checkbox')).toHaveCount(5);
  for (const name of ['Maternelle Petite Section', 'Maternelle Moyenne Section', 'Maternelle Grande Section', 'Nursery 2']) await expect(targetClasses.getByRole('checkbox', { name, exact: true })).toBeVisible();
  await expect(targetClasses.getByRole('checkbox', { name: 'Maternelle 2', exact: true })).toHaveCount(0);
  await expect(targetClasses.getByRole('checkbox', { name: 'CP', exact: true })).toHaveCount(0);
  await settingsPage.getByRole('group', { name: 'Cycles concernés', exact: true }).getByRole('checkbox', { name: 'Primaire', exact: true }).check();
  await expect(targetClasses.getByRole('checkbox')).toHaveCount(6);
  await targetClasses.getByRole('checkbox', { name: 'CP', exact: true }).check();
  await expect(targetStudents.getByRole('checkbox')).toHaveCount(4);
  await targetStudents.getByRole('searchbox').fill('AF-NEW');
  await expect(targetStudents.getByRole('checkbox')).toHaveCount(2);
  await targetStudents.getByRole('searchbox').fill('');
  await settingsPage.getByRole('group', { name: 'Cycles concernés', exact: true }).getByRole('checkbox', { name: 'Maternelle', exact: true }).uncheck();
  await settingsPage.getByRole('group', { name: 'Cycles concernés', exact: true }).getByRole('checkbox', { name: 'Secondaire', exact: true }).check();
  await expect(targetClasses.getByRole('checkbox')).toHaveCount(3);
  await settingsPage.getByRole('group', { name: 'Cycles concernés', exact: true }).getByRole('checkbox', { name: 'Secondaire', exact: true }).uncheck();
  await feeType.selectOption('other');
  await settingsPage.getByLabel('Précisez le libellé du frais').fill('Excursion cascade TEST');
  await settingsPage.getByLabel('Montant (FCFA)', { exact: true }).fill('7500');
  await targetStudents.getByRole('checkbox', { name: 'ALLFEES primary PK18 — AF-primary-18', exact: true }).check();
  await settingsPage.getByRole('button', { name: 'Vérifier avant publication', exact: true }).click();
  await expect(settingsPage.getByRole('region', { name: 'Résumé avant publication' })).toContainText('Élèves concernés : 1');
  for (const width of [360, 768, 1440]) {
    await settingsPage.setViewportSize({ width, height: 1000 });
    if (width <= 640) {
      const sidebar = settingsPage.getByTestId('sidebar');
      if ((await sidebar.getAttribute('class')).includes('sidebar-open')) await sidebar.locator('.sidebar-close-button').click();
      await expect(sidebar).not.toBeInViewport();
    }
    assert.equal(await settingsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await settingsPage.screenshot({ path: `all-fees-cascade-${width}.png`, fullPage: true });
  }
  const ledgerBeforePublication = (await db.collection('payments').where('schoolId', '==', schoolId).get()).docs.map(d => d.id).sort();
  await settingsPage.getByRole('button', { name: 'Publier le frais', exact: true }).click();
  await expect.poll(async () => (await db.collection('schools').doc(schoolId).get()).data().feeCatalog.some(f => f.label === 'Excursion cascade TEST')).toBe(true);
  const published = (await db.collection('schools').doc(schoolId).get()).data().feeCatalog.find(f => f.label === 'Excursion cascade TEST');
  assert.deepEqual(published.cycles, ['primary']); assert.deepEqual(published.classIds, [`${schoolId}-primary`]);
  assert.deepEqual(published.studentIds, [studentId]);
  assert.equal((await account(studentId)).lines.find(l => l.feeId === published.id).grossExpectedAmount, 7500);
  for (const otherStudent of [students.primary36, newStudentId, students.nursery18, students.secondary18]) {
    assert.equal((await account(otherStudent)).lines.some(l => l.feeId === published.id), false);
  }
  assert.deepEqual((await db.collection('payments').where('schoolId', '==', schoolId).get()).docs.map(d => d.id).sort(), ledgerBeforePublication);
  await page.goto(`${origin}/#/payments`);
  await page.getByTestId('open-cash-payment').click();
  await page.getByTestId('cash-payment-student').selectOption(studentId);
  const createdAmount = page.getByLabel('Montant reçu pour Excursion cascade TEST', { exact: true });
  await createdAmount.waitFor({ state: 'attached', timeout: 30000 });
  const createdGroup = createdAmount.locator('xpath=ancestor::details[contains(@class,"account-fee-group")]');
  if (await createdGroup.getAttribute('open') === null) await createdGroup.locator('summary').first().click();
  await createdAmount.fill('2500');
  await page.getByTestId('cash-payment-submit').click();
  await page.getByRole('heading', { name: 'Encaissement enregistré ✓', exact: true }).waitFor({ timeout: 30000 });
  await expect(page.locator('.student-account-receipt')).toContainText('Excursion cascade TEST');
  const createdBalance = (await account(studentId)).lines.find(l => l.feeId === published.id);
  assert.equal(createdBalance.grossExpectedAmount, 7500);
  assert.equal(createdBalance.previousPaid, 2500); assert.equal(createdBalance.remainingBalance, 5000);
  await page.screenshot({ path: 'all-fees-created-fee-partial-payment.png', fullPage: true });
  pass('UI CREATE / CYCLE / CLASS / INDIVIDUAL STUDENT / PUBLISH / ENCAISSEMENT / 7500 / PAY 2500 / REMAINDER 5000');
  const ledgerAfterPayment = (await db.collection('payments').where('schoolId', '==', schoolId).get()).docs.map(d => ({ id: d.id, data: d.data() })).sort((a,b) => a.id.localeCompare(b.id));
  const receiptsAfterPayment = (await db.collection('receipts').where('schoolId', '==', schoolId).get()).docs.map(d => ({ id: d.id, data: d.data() })).sort((a,b) => a.id.localeCompare(b.id));
  const publishedRow = settingsPage.locator('.school-fee-list li').filter({ has: settingsPage.getByText('Excursion cascade TEST', { exact: true }) });
  await publishedRow.getByRole('button', { name: 'Modifier le frais', exact: true }).click();
  await settingsPage.getByLabel('Précisez le libellé du frais').fill('Excursion révisée TEST');
  await settingsPage.getByLabel('Montant (FCFA)', { exact: true }).fill('9000');
  await settingsPage.getByLabel('Description', { exact: true }).fill('Description modifiée depuis Staging');
  await settingsPage.getByLabel('Échéance éventuelle').fill('2027-05-20');
  await settingsPage.getByLabel('Motif de la modification du frais').fill('Révision complète isolée');
  await settingsPage.getByRole('button', { name: 'Vérifier avant publication', exact: true }).click();
  await settingsPage.getByRole('button', { name: 'Publier les modifications', exact: true }).click();
  const revisedRow = settingsPage.locator('.school-fee-list li').filter({ has: settingsPage.getByText('Excursion révisée TEST', { exact: true }) });
  await expect(revisedRow).toContainText('Description modifiée depuis Staging');
  assert.deepEqual((await account(studentId)).lines.find(l => l.feeId === published.id), createdBalance);
  await revisedRow.getByRole('button', { name: 'Désactiver les nouvelles affectations', exact: true }).click();
  await expect(revisedRow).toContainText('INACTIF');
  assert.deepEqual((await account(studentId)).lines.find(l => l.feeId === published.id), createdBalance);
  const legacyBefore = (await account(students.secondary18)).lines.find(l => l.feeId === 'legacy-test');
  const legacyRow = settingsPage.locator('.school-fee-list li').filter({ has: settingsPage.getByText('Frais historique TEST', { exact: true }) });
  await legacyRow.getByRole('button', { name: 'Désactiver les nouvelles affectations', exact: true }).click();
  await expect(legacyRow).toContainText('INACTIF');
  const legacyAfter = (await account(students.secondary18)).lines.find(l => l.feeId === 'legacy-test');
  assert.equal(legacyAfter.grossExpectedAmount, legacyBefore.grossExpectedAmount);
  assert.equal(legacyAfter.remainingBalance, legacyBefore.remainingBalance);
  assert.deepEqual((await db.collection('payments').where('schoolId', '==', schoolId).get()).docs.map(d => ({ id: d.id, data: d.data() })).sort((a,b) => a.id.localeCompare(b.id)), ledgerAfterPayment);
  assert.deepEqual((await db.collection('receipts').where('schoolId', '==', schoolId).get()).docs.map(d => ({ id: d.id, data: d.data() })).sort((a,b) => a.id.localeCompare(b.id)), receiptsAfterPayment);
  pass('FULL CATALOGUE EDIT / ARCHIVE UI / LEGACY DEBT PRESERVED / UNEXPECTED PAYMENT AND RECEIPT WRITES 0');
  for (const label of ['Établissement', 'Cycles & classes', 'Année académique', 'Transport', 'Documents & reçus', 'Politiques', 'Rôles & validations', 'Finances & tarifs']) {
    await settingsPage.getByRole('navigation', { name: 'Sections des paramètres' }).getByRole('button', { name: label, exact: true }).click();
  }
  pass('EXISTING PARAMETERS SECTIONS ACCESSIBLE');
  await settingsPage.getByLabel('PK14 à PK33 — FCFA / mois').fill('4600');
  await settingsPage.getByLabel('Motif de la modification tarifaire').fill('Validation UI de la publication prospective');
  settingsPage.once('dialog', dialog => dialog.accept());
  await settingsPage.getByRole('button', { name: 'Enregistrer les tarifs', exact: true }).click();
  await expect.poll(async () => (await db.collection('schools').doc(schoolId).get()).data().transportPolicy.pkRates.pk14To33).toBe(4600);
  assert.equal((await account(studentId)).lines.find(l => l.key === transport.key).grossExpectedAmount, 4000);
  pass('PARAMETERS DIRECTOR SAVE / HISTORICAL OBLIGATION PRESERVED');
  for (const width of [360, 768, 1440]) {
    await settingsPage.setViewportSize({ width, height: 1000 });
    if (width <= 640) {
      const sidebar = settingsPage.getByTestId('sidebar');
      if ((await sidebar.getAttribute('class')).includes('sidebar-open')) await sidebar.locator('.sidebar-close-button').click();
      await expect(sidebar).not.toBeInViewport();
    }
    await expect(settingsPage.getByLabel('PK14 à PK33 — FCFA / mois')).toHaveValue('4600');
    await expect(settingsPage.getByLabel('PK34 à PK42 — FCFA / mois')).toHaveValue('5500');
    assert.equal(await settingsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await settingsPage.screenshot({ path: `all-fees-settings-${width}.png`, fullPage: true });
    pass(`PARAMETERS ${width}`);
  }
  assert.deepEqual(errors, []);
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
  const collections = ['studentFinancialObligations', 'studentFeeAssignments', 'studentTransportPlans', 'financialBenefits', 'paymentMoratoriums', 'payments', 'receipts',
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
  const versions = db.collection('schools').doc(schoolId).collection('financialTariffVersions');
  for (const version of (await versions.get()).docs) await version.ref.delete();
  assert.equal((await versions.get()).size, 0);
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


