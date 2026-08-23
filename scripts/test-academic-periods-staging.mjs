import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { chromium } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase/app';
import { deleteDoc, doc, getFirestore as getClientFirestore } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { assertAutomationBypassSecret, assertProtectedPreviewLoaded } from './staging-firebase-precheck.mjs';

const PROJECT = 'ecoscolaire-staging';
const REQUIRED = [
  'STAGING_APP_URL', 'STAGING_FIREBASE_SERVICE_ACCOUNT', 'STAGING_FIREBASE_API_KEY',
  'STAGING_FIREBASE_AUTH_DOMAIN', 'STAGING_FIREBASE_PROJECT_ID', 'STAGING_FIREBASE_STORAGE_BUCKET',
  'STAGING_FIREBASE_MESSAGING_SENDER_ID', 'STAGING_FIREBASE_APP_ID', 'VERCEL_AUTOMATION_BYPASS_SECRET',
];
const requiredEnvironment = () => {
  const missing = REQUIRED.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing staging secrets: ${missing.join(', ')}`);
  assert.equal(process.env.STAGING_FIREBASE_PROJECT_ID, PROJECT);
  assertAutomationBypassSecret(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  return new URL(process.env.STAGING_APP_URL).origin;
};
const config = () => ({
  apiKey: process.env.STAGING_FIREBASE_API_KEY, authDomain: process.env.STAGING_FIREBASE_AUTH_DOMAIN,
  projectId: PROJECT, storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.STAGING_FIREBASE_MESSAGING_SENDER_ID, appId: process.env.STAGING_FIREBASE_APP_ID,
});
const callableFailure = async (promise, code) => assert.rejects(promise, error => error?.code === `functions/${code}`);

async function run() {
  const appUrl = requiredEnvironment();
  const token = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const testRunId = `italo-w2-01-${token}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  const fixture = { testFixture: true, testRunId };
  const password = `T!${randomBytes(18).toString('base64url')}9a`;
  const schoolId = `period-school-${testRunId}`;
  const yearId = `period-year-${testRunId}`;
  const roles = ['owner', 'director', 'secretary', 'teacher'];
  let credentials;
  try { credentials = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT); } catch { throw new Error('Invalid staging service account JSON.'); }
  assert.equal(credentials.project_id, PROJECT);
  const adminApp = initializeAdminApp({ credential: cert(credentials) }, `period-admin-${testRunId}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const authUids = [];
  const clientApps = [];
  const contexts = [];
  const createdPeriodIds = [];

  const newPage = async (role, viewport = { width: 1440, height: 900 }) => {
    const context = await browser.newContext({ viewport });
    contexts.push(context);
    await context.addInitScript(runId => sessionStorage.setItem('ECOSCOLAIRE_PERIOD_TEST_RUN_ID', runId), testRunId);
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());
    await page.route(`${appUrl}/**`, route => route.continue({ headers: {
      ...route.request().headers(), 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'x-vercel-set-bypass-cookie': 'true',
    } }));
    await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
    assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: page.url() });
    await page.getByTestId('login-email').fill(`${role}.${testRunId}@example.test`);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 30_000 });
    await page.goto(`${appUrl}/#/academic-periods`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('academic-periods-page').waitFor({ timeout: 30_000 });
    return page;
  };

  try {
    await db.collection('schools').doc(schoolId).create({
      id: schoolId, name: `ITALO Period Fixture ${testRunId}`, status: 'active', active: true,
      activeAcademicYearId: yearId, academicYear: 'FIXTURE-2030-2031', version: 1,
      createdAt: FieldValue.serverTimestamp(), ...fixture,
    });
    await db.collection('academicYears').doc(yearId).create({
      id: yearId, schoolId, name: 'FIXTURE-2030-2031', startDate: '2030-09-01', endDate: '2031-06-30',
      status: 'active', version: 1, createdAt: FieldValue.serverTimestamp(), createdBy: 'fixture',
      updatedAt: FieldValue.serverTimestamp(), updatedBy: 'fixture', ...fixture,
    });
    for (const role of roles) {
      const email = `${role}.${testRunId}@example.test`;
      const account = await adminAuth.createUser({ email, password, emailVerified: true });
      authUids.push(account.uid);
      await db.collection('users').doc(account.uid).create({
        id: account.uid, email, role, schoolId, active: true, isActive: true,
        createdAt: FieldValue.serverTimestamp(), ...fixture,
      });
    }

    const ownerPage = await newPage('owner');
    const createViaUi = async ({ name, order, startDate, endDate }) => {
      await ownerPage.getByTestId('add-academic-period').click();
      await ownerPage.locator('#periodNameInput').fill(name);
      await ownerPage.locator('input[type="number"]').fill(String(order));
      await ownerPage.locator('#periodStartDateInput').fill(startDate);
      await ownerPage.locator('#periodEndDateInput').fill(endDate);
      await ownerPage.getByTestId('save-academic-period').click();
      await ownerPage.locator('#periodNameInput').waitFor({ state: 'hidden', timeout: 30_000 });
      const snapshot = await db.collection('periods').where('testRunId', '==', testRunId).where('name', '==', name).get();
      assert.equal(snapshot.size, 1);
      createdPeriodIds.push(snapshot.docs[0].id);
      return snapshot.docs[0].id;
    };

    const periodA = await createViaUi({ name: `A-${testRunId}`, order: 1, startDate: '2030-09-01', endDate: '2030-12-20' });
    await ownerPage.reload({ waitUntil: 'domcontentloaded' });
    await ownerPage.getByTestId(`edit-period-${periodA}`).click();
    await ownerPage.locator('#periodNameInput').fill(`A-edit-${testRunId}`);
    await ownerPage.getByTestId('save-academic-period').click();
    await ownerPage.locator('#periodNameInput').waitFor({ state: 'hidden', timeout: 30_000 });
    assert.equal((await db.collection('periods').doc(periodA).get()).data()?.name, `A-edit-${testRunId}`);
    const periodB = await createViaUi({ name: `B-${testRunId}`, order: 2, startDate: '2031-01-05', endDate: '2031-03-31' });

    await ownerPage.getByTestId(`open-period-${periodA}`).click();
    await ownerPage.getByTestId(`close-period-${periodA}`).waitFor({ timeout: 30_000 });
    await ownerPage.getByTestId(`open-period-${periodB}`).click();
    await ownerPage.getByText(/Fermez la période ouverte/i).waitFor({ timeout: 30_000 });
    await ownerPage.getByTestId(`close-period-${periodA}`).click();
    await ownerPage.getByTestId(`open-period-${periodB}`).waitFor({ timeout: 30_000 });
    await ownerPage.getByTestId(`open-period-${periodB}`).click();
    await ownerPage.getByTestId(`close-period-${periodB}`).waitFor({ timeout: 30_000 });

    const clients = {};
    for (const role of roles) {
      const app = initializeApp(config(), `period-${role}-${testRunId}`);
      clientApps.push(app);
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, `${role}.${testRunId}@example.test`, password);
      clients[role] = { manage: httpsCallable(getFunctions(app, 'us-central1'), 'manageAcademicPeriod'), db: getClientFirestore(app) };
    }
    const action = { action: 'CLOSE', schoolId, academicYearId: yearId, periodId: periodB };
    await callableFailure(clients.secretary.manage(action), 'permission-denied');
    await callableFailure(clients.teacher.manage(action), 'permission-denied');
    await callableFailure(clients.owner.manage({ ...action, schoolId: 'cross-school-fixture' }), 'permission-denied');
    await callableFailure(clients.owner.manage({ ...action, action: 'OPEN', periodId: periodA }), 'failed-precondition');
    await assert.rejects(deleteDoc(doc(clients.owner.db, 'periods', periodA)));

    for (const role of ['secretary', 'teacher']) {
      const page = await newPage(role, { width: 390, height: 844 });
      await page.getByText(`A-edit-${testRunId}`).waitFor({ timeout: 30_000 });
      assert.equal(await page.getByTestId(`open-period-${periodA}`).count(), 0);
      assert.equal(await page.getByTestId(`close-period-${periodB}`).count(), 0);
    }

    const audits = await db.collection('audit_logs').where('testRunId', '==', testRunId).get();
    assert.equal(audits.size, 6);
    assert.ok(audits.docs.every(item => item.data().canonicalBackendAudit === true));
    assert.strictEqual((await db.collection('academicYears').doc(yearId).get()).data()?.openPeriodId, periodB);
    console.log(`ITALO-W2-01 STAGING E2E PASS ${testRunId}`);
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    for (const app of clientApps) await deleteApp(app).catch(() => undefined);
    const fixtureCollections = ['audit_logs', 'periods', 'academicYears', 'users', 'schools'];
    for (const collection of fixtureCollections) {
      const snapshot = await db.collection(collection).where('testRunId', '==', testRunId).get();
      for (const document of snapshot.docs) await document.ref.delete();
    }
    for (const uid of authUids) await adminAuth.deleteUser(uid).catch(() => undefined);
    for (const collection of fixtureCollections) {
      assert.equal((await db.collection(collection).where('testRunId', '==', testRunId).get()).size, 0);
    }
    await deleteAdminApp(adminApp);
  }
}

run().catch(error => { console.error(error); process.exit(1); });
