import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30000 });

const project = 'ecoscolaire-staging';
assert.equal(process.env.VITE_FIREBASE_PROJECT_ID, project);
assert.equal(process.env.TARGET_DEPLOYMENT_VERIFIED, 'true');
assert.match(process.env.EXPECTED_STAGING_SHA || '', /^[a-f0-9]{40}$/);
const runId = process.env.ALL_FEES_RUN_ID || '';
assert.match(runId, /^\d+-\d+$/);
const origin = new URL(process.env.STAGING_APP_URL).origin;
assert.match(origin, /^https:\/\/ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/);
assert.ok(process.env.VITE_FIREBASE_API_KEY);
const schoolId = `transportpolicy-staging-${runId}`;
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
  await seed('schools', schoolId, { id: schoolId, name: 'Transport persistence TEST', academicYear: year, activeAcademicYearId: yearId,
    active: true, subscriptionStatus: 'active', educationCycles: ['nursery', 'primary', 'secondary'],
    transportPolicy: { secretaryManageAll: true } });
  await seed('academicYears', yearId, { schoolId, name: year, status: 'active', startDate: '2026-09-01', endDate: '2027-06-30' });
  await makeUser('owner'); await makeUser('director'); await makeUser('secretary'); await makeUser('secretary', true);
  const schoolRef = db.collection('schools').doc(schoolId);
  const read = async () => (await schoolRef.get()).data();
  const evidence = { sha: process.env.EXPECTED_STAGING_SHA, url: origin, steps: [] };
  const record = async label => { evidence.steps.push({ label, policy: (await read()).transportPolicy }); pass(label); };
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) await page.route(`${origin}/**`, route => route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' } }));
  const openTransport = async () => {
    await page.getByRole('navigation', { name: 'Sections des paramètres' }).getByRole('button', { name: 'Transport', exact: true }).click();
    await expect(page.getByTestId('italo-transport-policy-enabled')).toBeVisible();
  };
  const login = async role => {
    await page.goto(`${origin}/#/login`);
    await page.getByTestId('login-email').fill(users[role].email);
    await page.getByTestId('login-password').fill(users[role].password);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('sidebar').waitFor({ timeout: 45000 });
    await page.goto(`${origin}/#/settings`);
    await openTransport();
  };
  await login('owner');
  const toggle = page.getByTestId('italo-transport-policy-enabled');
  const months = page.getByTestId('italo-transport-billing-periods');
  const rates = [page.getByLabel('PK14 à PK33 — FCFA / mois'), page.getByLabel('PK34 à PK42 — FCFA / mois')];
  const save = async () => {
    await page.getByTestId('transport-save-reason').fill('Validation persistance Transport');
    await page.getByTestId('save-transport-settings').click();
    await expect(page.getByTestId('transport-save-status')).toHaveText('Transport enregistré et confirmé par le serveur.');
  };
  const refresh = async enabled => { await page.reload(); await openTransport(); await expect(toggle).toBeChecked({ checked: enabled }); };
  await expect(toggle).not.toBeChecked();
  assert.equal((await read()).transportPolicy.feePolicyId, undefined);
  await record('INITIAL OFF LEGACY');
  await toggle.check();
  await page.getByTestId('save-transport-settings').click();
  await expect(page.getByRole('alert')).toContainText('mois facturables');
  await expect(page.getByTestId('transport-save-status')).toContainText('non enregistrées');
  assert.equal((await read()).transportPolicy.feePolicyId, undefined);
  await record('MISSING MONTHS REJECTED VISIBLY / NO WRITE');
  await months.fill('2026-09, 2026-10');
  await save();
  assert.equal((await read()).transportPolicy.feePolicyId, 'ITALO_PK_2026');
  await record('ON WRITE VERIFIED');
  await refresh(true); await record('ON FULL REFRESH');
  await page.getByTestId('logout-button').click();
  await page.getByTestId('login-email').waitFor();
  await login('owner'); await expect(toggle).toBeChecked(); await record('LOGOUT LOGIN ON');
  await toggle.uncheck(); await save();
  assert.equal((await read()).transportPolicy.feePolicyId, null);
  assert.deepEqual((await read()).transportPolicy.billingPeriods, ['2026-09', '2026-10']);
  await refresh(false); await record('OFF WRITE REFRESH / CALENDAR PRESERVED');
  await toggle.check(); await save(); await refresh(true); await record('REACTIVATION WRITE REFRESH');
  await rates[0].fill('4500'); await rates[1].fill('5500'); await months.fill('2026-09, 2026-11, 2027-02');
  await save(); await refresh(true);
  await expect(rates[0]).toHaveValue('4500'); await expect(rates[1]).toHaveValue('5500');
  await expect(months).toHaveValue('2026-09, 2026-11, 2027-02');
  assert.deepEqual((await read()).transportPolicy.pkRates, { pk14To33: 4500, pk34To42: 5500 });
  assert.deepEqual((await read()).transportPolicy.billingPeriods, ['2026-09', '2026-11', '2027-02']);
  await record('CUSTOM RATES AND BILLABLE MONTHS WRITE REFRESH');
  await rates[0].fill('4000'); await rates[1].fill('5000'); await save(); await refresh(true);
  assert.deepEqual((await read()).transportPolicy.pkRates, { pk14To33: 4000, pk34To42: 5000 });
  await record('4000 / 5000 RESTORED AND PERSISTED');
  const beforeMetadata = (await read()).transportPolicy;
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
  await expect.poll(async () => (await read()).transportPolicy).toEqual(beforeMetadata);
  await refresh(true); await record('GLOBAL SAVE DOES NOT OVERWRITE TRANSPORT');
  const current = await read();
  const request = { action: 'configure', academicYear: year, expectedVersion: current.financialTariffVersion,
    reason: 'RBAC test', configuration: { globalFees: current.globalFees, classFees: current.classFees, transportPolicy: { feePolicyId: null, billingPeriods: current.transportPolicy.billingPeriods, pkRates: current.transportPolicy.pkRates } } };
  await denied(call('manageSchoolFee', request));
  await denied(call('manageSchoolFee', request, 'foreign'));
  await assert.rejects(call('manageSchoolFee', { ...request, expectedVersion: null }, 'director'), e => e.status === 'FAILED_PRECONDITION');
  assert.deepEqual((await read()).transportPolicy, beforeMetadata);
  await record('RBAC / CROSS SCHOOL / STALE VERSION REJECTED');
  assert.equal((await read()).transportPolicy.secretaryManageAll, true);
  for (const collection of ['payments', 'receipts', 'studentFinancialObligations', 'studentFinance', 'studentTransportPlans', 'paymentAllocations', 'transportPaymentAllocations']) {
    assert.equal((await db.collection(collection).where('schoolId', '==', schoolId).get()).size, 0, `${collection}: unexpected financial write`);
  }
  assert.deepEqual(errors, []);
  await record('NO UNEXPECTED FINANCIAL WRITE');
  fs.writeFileSync('transport-persistence-evidence.json', JSON.stringify(evidence, null, 2));
} finally {
  if (browser) await browser.close();
  const collections = ['studentFinancialObligations', 'studentFeeAssignments', 'studentTransportPlans', 'financialBenefits', 'paymentMoratoriums', 'payments', 'receipts',
    'paymentAllocations', 'transportPaymentAllocations', 'audit_logs', 'cashLedgerDays', 'cashClosures', 'studentPrivate', 'studentFinance',
    'studentParentPrivate', 'studentParentFinance', 'students', 'classes', 'grades', 'periods', 'academicYears'];
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


