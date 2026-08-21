import assert from 'node:assert/strict';
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
const REQUIRED_ENV = [
  'STAGING_APP_URL', 'STAGING_FIREBASE_SERVICE_ACCOUNT',
  'STAGING_TEST_ALPHA_PASSWORD', 'STAGING_TEST_BETA_PASSWORD',
  'STAGING_FIREBASE_API_KEY', 'STAGING_FIREBASE_AUTH_DOMAIN',
  'STAGING_FIREBASE_PROJECT_ID', 'STAGING_FIREBASE_STORAGE_BUCKET',
  'STAGING_FIREBASE_MESSAGING_SENDER_ID', 'STAGING_FIREBASE_APP_ID',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
];
const ACCOUNTS = {
  owner: ['owner.alpha@ecoscolaire.com', 'alpha'],
  director: ['director.alpha@ecoscolaire.com', 'alpha'],
  secretary: ['secretary.alpha@ecoscolaire.com', 'alpha'],
  teacher: ['teacher1.alpha@ecoscolaire.com', 'alpha'],
  otherOwner: ['owner.beta@ecoscolaire.com', 'beta'],
};

const requireEnvironment = () => {
  const missing = REQUIRED_ENV.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing required staging secrets: ${missing.join(', ')}`);
  assertAutomationBypassSecret(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  assert.equal(process.env.STAGING_FIREBASE_PROJECT_ID, EXPECTED_PROJECT);
  const url = new URL(process.env.STAGING_APP_URL);
  assert.equal(url.protocol, 'https:');
  assert.match(url.hostname, /^ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/);
  return url.origin;
};

const firebaseConfig = () => ({
  apiKey: process.env.STAGING_FIREBASE_API_KEY,
  authDomain: process.env.STAGING_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
  storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.STAGING_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.STAGING_FIREBASE_APP_ID,
});

const callableFailure = async (operation, code) => {
  await assert.rejects(operation, error => {
    assert.equal(error?.code, `functions/${code}`);
    return true;
  });
};

const run = async () => {
  const appUrl = requireEnvironment();
  const token = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '1').replace(/[^A-Za-z0-9_-]/g, '-');
  const suffix = `italo-w1-01-${token}-${attempt}`;
  const ids = {
    student: `e2e-class-student-${suffix}`,
    classA: `e2e-class-a-${suffix}`,
    classB: `e2e-class-b-${suffix}`,
    inactive: `e2e-class-inactive-${suffix}`,
    cross: `e2e-class-cross-${suffix}`,
  };
  const names = {
    student: `Élève fictif Classes ${suffix}`,
    classA: `ITALO A ${suffix}`,
    classB: `ITALO B ${suffix}`,
  };

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT);
  } catch {
    throw new Error('STAGING_FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
  }
  assert.equal(serviceAccount.project_id, EXPECTED_PROJECT);

  const adminApp = initializeAdminApp({ credential: cert(serviceAccount) }, `classes-admin-${suffix}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  await page.route(`${appUrl}/**`, route => route.continue({
    headers: {
      ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'x-vercel-set-bypass-cookie': 'true',
    },
  }));
  const firebaseRequests = [];
  page.on('request', request => {
    if (classifyFirebaseRequest(request.url()).relevant) firebaseRequests.push(request.url());
  });

  const clientApps = [];
  let alphaSchoolId;
  let betaSchoolId;
  try {
    console.log('PRECHECK: immutable preview and Staging Firebase only');
    const stagingRequest = page.waitForRequest(
      request => classifyFirebaseRequest(request.url()).staging,
      { timeout: 30_000 },
    );
    await page.goto(`${appUrl}/#/diagnostic`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: page.url() });
    const runtimeProjectElement = page.getByTestId('diagnostic-firebase-project');
    await runtimeProjectElement.waitFor({ state: 'visible', timeout: 30_000 });
    const runtimeProject = (await runtimeProjectElement.textContent())?.trim() || '';
    assertStagingRuntimeProject(runtimeProject);
    await page.evaluate(async url => fetch(url, { method: 'GET', credentials: 'omit' }).catch(() => undefined),
      `https://firestore.googleapis.com/v1/projects/${EXPECTED_PROJECT}/databases/(default)/documents/__e2e_precheck__/classes`);
    await stagingRequest;
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequests });

    const profiles = {};
    for (const [key, [email]] of Object.entries(ACCOUNTS)) {
      const account = await adminAuth.getUserByEmail(email);
      const snapshot = await db.collection('users').doc(account.uid).get();
      assert.equal(snapshot.exists, true, `${key} profile is missing`);
      profiles[key] = { uid: account.uid, ...snapshot.data() };
    }
    assert.equal(profiles.owner.role, 'owner');
    assert.equal(profiles.director.role, 'director');
    assert.equal(profiles.secretary.role, 'secretary');
    assert.equal(profiles.teacher.role, 'teacher');
    assert.equal(profiles.otherOwner.role, 'owner');
    alphaSchoolId = String(profiles.owner.schoolId || '');
    betaSchoolId = String(profiles.otherOwner.schoolId || '');
    assert.ok(alphaSchoolId && betaSchoolId && alphaSchoolId !== betaSchoolId);
    assert.equal(profiles.director.schoolId, alphaSchoolId);
    assert.equal(profiles.secretary.schoolId, alphaSchoolId);

    console.log(`FIXTURES: ${suffix}`);
    const now = FieldValue.serverTimestamp();
    await Promise.all([
      db.collection('classes').doc(ids.classA).create({
        id: ids.classA, schoolId: alphaSchoolId, name: names.classA, section: 'francophone',
        type: 'francophone', cycle: 'primary', educationType: 'general', isActive: true,
        testFixture: true, testRunId: suffix, createdAt: now,
      }),
      db.collection('classes').doc(ids.classB).create({
        id: ids.classB, schoolId: alphaSchoolId, name: names.classB, section: 'francophone',
        type: 'francophone', cycle: 'primary', educationType: 'general', isActive: true,
        testFixture: true, testRunId: suffix, createdAt: now,
      }),
      db.collection('classes').doc(ids.inactive).create({
        id: ids.inactive, schoolId: alphaSchoolId, name: `ITALO Inactive ${suffix}`,
        section: 'francophone', type: 'francophone', cycle: 'primary', educationType: 'general',
        isActive: false, testFixture: true, testRunId: suffix, createdAt: now,
      }),
      db.collection('classes').doc(ids.cross).create({
        id: ids.cross, schoolId: betaSchoolId, name: `ITALO Cross ${suffix}`,
        section: 'francophone', type: 'francophone', cycle: 'primary', educationType: 'general',
        isActive: true, testFixture: true, testRunId: suffix, createdAt: now,
      }),
      db.collection('students').doc(ids.student).create({
        id: ids.student, schoolId: alphaSchoolId, name: names.student, gender: 'F',
        section: 'francophone', classId: ids.classB, schoolingStatus: 'active',
        testFixture: true, testRunId: suffix, createdAt: now,
      }),
    ]);

    const clients = {};
    for (const [key, [email, passwordKind]] of Object.entries(ACCOUNTS)) {
      const app = initializeApp(firebaseConfig(), `classes-${key}-${suffix}`);
      clientApps.push(app);
      const auth = getAuth(app);
      const password = passwordKind === 'alpha'
        ? process.env.STAGING_TEST_ALPHA_PASSWORD : process.env.STAGING_TEST_BETA_PASSWORD;
      await signInWithEmailAndPassword(auth, email, password);
      clients[key] = { auth, call: httpsCallable(getFunctions(app, 'us-central1'), 'assignStudentToClass') };
    }

    console.log('ASSIGNMENT: owner/director/secretary allowed; unauthorized/cross-school/inactive denied');
    assert.equal((await clients.owner.call({ studentId: ids.student, targetClassId: ids.classA })).data.classId, ids.classA);
    assert.equal((await clients.director.call({ studentId: ids.student, targetClassId: ids.classB })).data.classId, ids.classB);
    assert.equal((await clients.secretary.call({ studentId: ids.student, targetClassId: ids.classA })).data.classId, ids.classA);
    await callableFailure(() => clients.teacher.call({ studentId: ids.student, targetClassId: ids.classB }), 'permission-denied');
    await callableFailure(() => clients.owner.call({ studentId: ids.student, targetClassId: ids.cross }), 'failed-precondition');
    await callableFailure(() => clients.otherOwner.call({ studentId: ids.student, targetClassId: ids.classB }), 'permission-denied');
    await callableFailure(() => clients.owner.call({ studentId: ids.student, targetClassId: ids.inactive }), 'failed-precondition');

    console.log('CONCURRENCY: two valid assignments leave one canonical classId');
    await db.collection('students').doc(ids.student).update({ classId: 'e2e-unassigned-fixture' });
    const concurrent = await Promise.all([
      clients.owner.call({ studentId: ids.student, targetClassId: ids.classA }),
      clients.director.call({ studentId: ids.student, targetClassId: ids.classB }),
    ]);
    assert.equal(concurrent.every(result => result.data.success === true), true);
    assert.ok([ids.classA, ids.classB].includes((await db.collection('students').doc(ids.student).get()).data()?.classId));
    await clients.owner.call({ studentId: ids.student, targetClassId: ids.classB });

    console.log('UI: backend-first assignment A, reload A, assignment B, reload B');
    await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email').fill(ACCOUNTS.owner[0]);
    await page.getByTestId('login-password').fill(process.env.STAGING_TEST_ALPHA_PASSWORD);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 20_000 });

    const selectDetailedClass = async className => {
      const picker = page.getByRole('button', { name: /classe.*élève|Choisir une classe/i }).first();
      await picker.click();
      await page.getByPlaceholder(/Rechercher une classe/i).fill(className);
      await page.getByRole('option', { name: new RegExp(className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
      await page.getByRole('heading', { name: className, exact: true }).waitFor({ timeout: 20_000 });
    };
    const assignThroughUi = async (fromName, targetClassId) => {
      await page.goto(`${appUrl}/#/classes`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Classes.*Vue d'ensemble/i }).waitFor({ timeout: 20_000 });
      await selectDetailedClass(fromName);
      const row = page.getByRole('row').filter({ hasText: names.student });
      await row.waitFor({ state: 'visible', timeout: 20_000 });
      await row.getByRole('combobox', { name: new RegExp(`Reclasser ${names.student}`) }).selectOption(targetClassId);
      await page.getByText(/Élève reclassé avec succès/i).waitFor({ timeout: 20_000 });
    };

    await assignThroughUi(names.classB, ids.classA);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await selectDetailedClass(names.classA);
    await page.getByText(names.student, { exact: true }).waitFor({ timeout: 20_000 });
    assert.equal((await db.collection('students').doc(ids.student).get()).data()?.classId, ids.classA);

    await assignThroughUi(names.classA, ids.classB);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await selectDetailedClass(names.classB);
    await page.getByText(names.student, { exact: true }).waitFor({ timeout: 20_000 });
    assert.equal((await db.collection('students').doc(ids.student).get()).data()?.classId, ids.classB);

    console.log('RESPONSIVE: Classes at 360, 768 and 1440 pixels');
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${appUrl}/#/classes`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Classes.*Vue d'ensemble/i }).waitFor({ timeout: 20_000 });
      await selectDetailedClass(names.classB);
      const row = page.getByRole('row').filter({ hasText: names.student });
      await row.waitFor({ state: 'visible', timeout: 20_000 });
      assert.equal(await row.getByRole('combobox').isVisible(), true, `assignment control missing at ${width}px`);
      console.log(`RESPONSIVE ${width}: PASS`);
    }
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequests });
    console.log('ITALO-W1-01 CLASSES LIVE E2E: PASS');
  } finally {
    console.log('CLEANUP: exact testRunId fixtures only');
    for (const app of clientApps) {
      try {
        const auth = getAuth(app);
        if (auth.currentUser) await signOut(auth);
        await deleteApp(app);
      } catch { /* cleanup continues */ }
    }

    const auditSnapshot = await db.collection('audit_logs').where('testRunId', '==', suffix).get();
    const batch = db.batch();
    auditSnapshot.docs.forEach(document => batch.delete(document.ref));
    batch.delete(db.collection('students').doc(ids.student));
    for (const id of [ids.classA, ids.classB, ids.inactive, ids.cross]) batch.delete(db.collection('classes').doc(id));
    await batch.commit();

    const [student, classFixtures, studentFixtures, auditFixtures, orphanAudits] = await Promise.all([
      db.collection('students').doc(ids.student).get(),
      db.collection('classes').where('testRunId', '==', suffix).get(),
      db.collection('students').where('testRunId', '==', suffix).get(),
      db.collection('audit_logs').where('testRunId', '==', suffix).get(),
      db.collection('audit_logs').where('targetId', '==', ids.student).get(),
    ]);
    const residuals = Number(student.exists) + classFixtures.size + studentFixtures.size + auditFixtures.size;
    const orphans = orphanAudits.size;
    console.log(`CLEANUP residuals=${residuals} orphans=${orphans}`);
    assert.equal(residuals, 0);
    assert.equal(orphans, 0);
    await context.close();
    await browser.close();
    await deleteAdminApp(adminApp);
  }
};

run().catch(error => {
  const message = String(error?.stack || error);
  let redacted = message;
  for (const name of REQUIRED_ENV) {
    if (name === 'STAGING_APP_URL') continue;
    const secret = process.env[name];
    if (secret && secret.length >= 4) redacted = redacted.split(secret).join('[REDACTED]');
  }
  console.error(redacted);
  process.exitCode = 1;
});
