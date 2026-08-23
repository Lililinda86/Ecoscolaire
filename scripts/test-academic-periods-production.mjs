import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { applicationDefault, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { chromium } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import {
  collection, deleteDoc, doc, getDocs, getFirestore as getClientFirestore,
  query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT = 'ecoscolaire-c5861';
const APP_URL = 'https://ecoscolaire.vercel.app';
const MARKER_PREFIX = 'ITALO-PROD-PERIOD-TEST-';
const REQUIRED = [
  'PRODUCTION_APP_URL', 'PRODUCTION_FIREBASE_PROJECT_ID', 'PRODUCTION_FIREBASE_API_KEY',
  'PRODUCTION_FIREBASE_AUTH_DOMAIN', 'PRODUCTION_FIREBASE_STORAGE_BUCKET',
  'PRODUCTION_FIREBASE_MESSAGING_SENDER_ID', 'PRODUCTION_FIREBASE_APP_ID',
  'PRODUCTION_EXPECTED_SHA', 'TEST_MARKER_PREFIX',
];
const REAL_DATA_COLLECTIONS = [
  'academicYears', 'periods', 'evaluations', 'grades', 'reportCards',
  'students', 'classes', 'subjects', 'staff',
];
const FIXTURE_COLLECTIONS = ['audit_logs', 'periods', 'academicYears', 'users', 'schools'];

const requireEnvironment = () => {
  const missing = REQUIRED.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing Production configuration: ${missing.join(', ')}`);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  assert.equal(process.env.PRODUCTION_APP_URL, APP_URL);
  assert.equal(process.env.PRODUCTION_FIREBASE_PROJECT_ID, PROJECT);
  assert.notEqual(process.env.PRODUCTION_FIREBASE_PROJECT_ID, 'ecoscolaire-staging');
  assert.equal(process.env.TEST_MARKER_PREFIX, MARKER_PREFIX);
  assert.match(process.env.PRODUCTION_EXPECTED_SHA, /^[a-f0-9]{40}$/);
};

const config = () => ({
  apiKey: process.env.PRODUCTION_FIREBASE_API_KEY,
  authDomain: process.env.PRODUCTION_FIREBASE_AUTH_DOMAIN,
  projectId: PROJECT,
  storageBucket: process.env.PRODUCTION_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.PRODUCTION_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.PRODUCTION_FIREBASE_APP_ID,
});

const expectFailure = async (operation, codes) => {
  try {
    await (typeof operation === 'function' ? operation() : operation);
    assert.fail(`Expected failure: ${codes.join(' or ')}`);
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    const normalized = String(error?.code || '').replace(/^functions\//, '');
    assert.ok(codes.includes(normalized), `Unexpected failure ${error?.code || 'unknown'}`);
  }
};

const snapshotRealData = async db => {
  const result = {};
  for (const name of REAL_DATA_COLLECTIONS) {
    const snapshot = await db.collection(name).get();
    result[name] = Object.fromEntries(snapshot.docs
      .filter(item => item.data().testFixture !== true)
      .map(item => [item.id, `${item.updateTime?.toMillis() || 0}:${item.data().version ?? ''}`]));
  }
  return result;
};

async function run() {
  requireEnvironment();
  const token = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const testRunId = `${MARKER_PREFIX}${token}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  const fixture = { testFixture: true, testRunId };
  const password = `T!${randomBytes(24).toString('base64url')}9a`;
  const schoolId = `period-school-${testRunId}`;
  const yearId = `period-year-${testRunId}`;
  const roles = ['owner', 'director', 'secretary', 'teacher', 'parent', 'student', 'boardViewer'];
  const adminApp = initializeAdminApp({ credential: applicationDefault(), projectId: PROJECT }, `prod-period-${token}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const authUids = [];
  const contexts = [];
  const createdPeriodIds = [];
  const realBefore = await snapshotRealData(db);
  let phase = 'fixture-setup';
  let primaryError;

  const newPage = async (role, viewport) => {
    const context = await browser.newContext({ viewport });
    contexts.push(context);
    await context.addInitScript(runId => sessionStorage.setItem('ECOSCOLAIRE_PERIOD_TEST_RUN_ID', runId), testRunId);
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${APP_URL}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email').fill(`${role}.${testRunId}@example.test`);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 30_000 });
    await page.goto(`${APP_URL}/#/academic-periods`, { waitUntil: 'domcontentloaded' });
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

    phase = 'client-authentication';
    const clients = {};
    for (const role of roles) {
      const app = initializeApp(config(), `prod-period-${role}-${testRunId}`);
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, `${role}.${testRunId}@example.test`, password);
      clients[role] = {
        manage: httpsCallable(getFunctions(app, 'us-central1'), 'manageAcademicPeriod'),
        db: getClientFirestore(app),
      };
    }

    phase = 'owner-ui-lifecycle';
    const ownerPage = await newPage('owner', { width: 1440, height: 900 });
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
    const payload = (name, order, startDate, endDate) => ({
      action: 'CREATE', schoolId, academicYearId: yearId,
      profile: { name, type: 'term', order, startDate, endDate, ...fixture },
    });

    const periodA = await createViaUi({ name: `A-${testRunId}`, order: 1, startDate: '2030-09-01', endDate: '2030-12-20' });
    await ownerPage.reload({ waitUntil: 'domcontentloaded' });
    await ownerPage.getByTestId(`edit-period-${periodA}`).click();
    await ownerPage.locator('#periodNameInput').fill(`A-edit-${testRunId}`);
    await ownerPage.getByTestId('save-academic-period').click();
    await ownerPage.locator('#periodNameInput').waitFor({ state: 'hidden', timeout: 30_000 });
    await ownerPage.reload({ waitUntil: 'domcontentloaded' });
    await ownerPage.getByText(`A-edit-${testRunId}`).waitFor({ timeout: 30_000 });
    const periodB = await createViaUi({ name: `B-${testRunId}`, order: 2, startDate: '2031-01-05', endDate: '2031-03-31' });

    phase = 'date-order-validation';
    await expectFailure(clients.owner.manage(payload('invalid-range', 10, '2030-10-02', '2030-10-01')), ['invalid-argument']);
    await expectFailure(clients.owner.manage(payload('outside-year', 10, '2030-08-31', '2030-08-31')), ['failed-precondition']);
    await expectFailure(clients.owner.manage(payload('overlap', 10, '2030-12-01', '2030-12-31')), ['failed-precondition']);
    await expectFailure(clients.owner.manage(payload('duplicate-order', 1, '2031-04-01', '2031-04-30')), ['already-exists']);

    const adjacentResult = await clients.director.manage(payload(`Adjacent-${testRunId}`, 3, '2030-12-21', '2031-01-04'));
    const periodC = adjacentResult.data.period.id;
    createdPeriodIds.push(periodC);
    await clients.director.manage({
      action: 'UPDATE', schoolId, academicYearId: yearId, periodId: periodC,
      profile: { name: `Adjacent-edit-${testRunId}`, type: 'term', order: 3, startDate: '2030-12-21', endDate: '2031-01-04', ...fixture },
    });

    phase = 'open-close-lifecycle';
    await ownerPage.getByTestId(`open-period-${periodA}`).click();
    await ownerPage.getByTestId(`close-period-${periodA}`).waitFor({ timeout: 30_000 });
    await ownerPage.getByTestId(`open-period-${periodB}`).click();
    await ownerPage.getByText(/Fermez la période ouverte/i).waitFor({ timeout: 30_000 });
    await ownerPage.getByTestId(`close-period-${periodA}`).click();
    await ownerPage.getByTestId(`open-period-${periodB}`).waitFor({ timeout: 30_000 });
    await ownerPage.getByTestId(`open-period-${periodB}`).click();
    await ownerPage.getByTestId(`close-period-${periodB}`).waitFor({ timeout: 30_000 });

    phase = 'rbac-callables';
    const closeB = { action: 'CLOSE', schoolId, academicYearId: yearId, periodId: periodB };
    await expectFailure(clients.secretary.manage(closeB), ['permission-denied']);
    await expectFailure(clients.teacher.manage(closeB), ['permission-denied']);
    await expectFailure(clients.parent.manage(closeB), ['permission-denied']);
    await expectFailure(clients.student.manage(closeB), ['permission-denied']);
    await expectFailure(clients.boardViewer.manage(closeB), ['permission-denied']);
    await expectFailure(clients.owner.manage({ ...closeB, schoolId: 'cross-school-fixture' }), ['permission-denied']);
    await expectFailure(clients.owner.manage({ ...closeB, action: 'OPEN', periodId: periodA }), ['failed-precondition']);

    phase = 'rbac-reads';
    for (const role of ['owner', 'director', 'secretary', 'teacher']) {
      const snapshot = await getDocs(query(collection(clients[role].db, 'periods'), where('schoolId', '==', schoolId)));
      assert.equal(snapshot.size, 3);
    }
    for (const role of ['parent', 'student', 'boardViewer']) {
      await expectFailure(getDocs(query(collection(clients[role].db, 'periods'), where('schoolId', '==', schoolId))), ['permission-denied']);
    }

    phase = 'direct-write-denials';
    const directId = `direct-${testRunId}`;
    const directRef = doc(clients.owner.db, 'periods', directId);
    await expectFailure(setDoc(directRef, { schoolId, academicYearId: yearId, ...fixture }), ['permission-denied']);
    await expectFailure(updateDoc(doc(clients.owner.db, 'periods', periodC), { name: 'forbidden' }), ['permission-denied']);
    await expectFailure(deleteDoc(doc(clients.owner.db, 'periods', periodA)), ['permission-denied']);

    phase = 'responsive-readonly-ui';
    const secretaryPage = await newPage('secretary', { width: 360, height: 800 });
    await secretaryPage.getByText(`A-edit-${testRunId}`).waitFor({ timeout: 30_000 });
    assert.equal(await secretaryPage.getByTestId(`open-period-${periodC}`).count(), 0);
    const teacherPage = await newPage('teacher', { width: 768, height: 900 });
    await teacherPage.getByText(`Adjacent-edit-${testRunId}`).waitFor({ timeout: 30_000 });
    assert.equal(await teacherPage.getByTestId(`open-period-${periodC}`).count(), 0);

    phase = 'audit-and-side-effects';
    const audits = await db.collection('audit_logs').where('testRunId', '==', testRunId).get();
    const periodAudits = audits.docs.filter(item => String(item.data().action || '').startsWith('ACADEMIC_PERIOD_'));
    assert.equal(periodAudits.length, 8);
    assert.deepEqual(new Set(periodAudits.map(item => item.data().action)), new Set([
      'ACADEMIC_PERIOD_CREATED', 'ACADEMIC_PERIOD_UPDATED',
      'ACADEMIC_PERIOD_OPENED', 'ACADEMIC_PERIOD_CLOSED',
    ]));
    assert.ok(periodAudits.every(item => item.data().canonicalBackendAudit === true));
    assert.ok(periodAudits.every(item => !('email' in item.data()) && !('name' in item.data())));
    assert.strictEqual((await db.collection('academicYears').doc(yearId).get()).data()?.openPeriodId, periodB);
    assert.equal((await db.collection('evaluations').where('testRunId', '==', testRunId).get()).size, 0);
    assert.equal((await db.collection('grades').where('testRunId', '==', testRunId).get()).size, 0);
    assert.equal((await db.collection('reportCards').where('testRunId', '==', testRunId).get()).size, 0);
    console.log(`ITALO-W2-01 PRODUCTION E2E PASS ${testRunId}`);
  } catch (error) {
    primaryError = error;
    console.error(`ITALO-W2-01 PRIMARY E2E ERROR phase=${phase}`, error);
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    for (const collectionName of FIXTURE_COLLECTIONS) {
      const snapshot = await db.collection(collectionName).where('testRunId', '==', testRunId).get();
      for (const document of snapshot.docs) await document.ref.delete();
    }
    for (const uid of authUids) await adminAuth.deleteUser(uid).catch(() => undefined);
    for (const collectionName of FIXTURE_COLLECTIONS) {
      assert.equal((await db.collection(collectionName).where('testRunId', '==', testRunId).get()).size, 0);
    }
    assert.deepEqual(await snapshotRealData(db), realBefore);
    console.log(`ITALO-W2-01 PRODUCTION CLEANUP PASS ${testRunId} residuals=0 orphans=0`);
    await deleteAdminApp(adminApp);
  }
  if (primaryError) throw primaryError;
}

run()
  .then(() => process.exit(0))
  .catch(error => { console.error(error); process.exit(1); });
