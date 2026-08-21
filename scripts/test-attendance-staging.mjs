import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  'STAGING_APP_URL', 'STAGING_FIREBASE_SERVICE_ACCOUNT', 'STAGING_TEST_ALPHA_PASSWORD',
  'STAGING_FIREBASE_API_KEY', 'STAGING_FIREBASE_AUTH_DOMAIN', 'STAGING_FIREBASE_PROJECT_ID',
  'STAGING_FIREBASE_STORAGE_BUCKET', 'STAGING_FIREBASE_MESSAGING_SENDER_ID',
  'STAGING_FIREBASE_APP_ID', 'VERCEL_AUTOMATION_BYPASS_SECRET',
];
const ACCOUNTS = {
  owner: 'owner.alpha@ecoscolaire.com',
  secretary: 'secretary.alpha@ecoscolaire.com',
  teacher: 'teacher1.alpha@ecoscolaire.com',
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

const schoolDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const attendanceId = (schoolId, academicYearId, date, studentId) => `att_${createHash('sha256')
  .update(`${schoolId}\u001f${academicYearId}\u001f${date}\u001f${studentId}`, 'utf8').digest('hex')}`;

const callableFailure = async (operation, code) => assert.rejects(operation, error => {
  assert.equal(error?.code, `functions/${code}`);
  return true;
});

const configurePage = async (browser, appUrl, firebaseRequests) => {
  const context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  await page.route(`${appUrl}/**`, route => route.continue({
    headers: {
      ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'x-vercel-set-bypass-cookie': 'true',
    },
  }));
  page.on('request', request => {
    if (classifyFirebaseRequest(request.url()).relevant) firebaseRequests.push(request.url());
  });
  return { context, page };
};

const login = async (page, appUrl, email) => {
  await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(process.env.STAGING_TEST_ALPHA_PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 20_000 });
  await page.goto(`${appUrl}/#/attendance`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Présences|Attendance/i }).waitFor({ timeout: 20_000 });
};

const run = async () => {
  const appUrl = requireEnvironment();
  const token = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '1').replace(/[^A-Za-z0-9_-]/g, '-');
  const testRunId = `italo-w1-02-${token}-${attempt}`;
  const date = schoolDate();
  const ids = {
    classA: `e2e-att-class-a-${testRunId}`,
    classB: `e2e-att-class-b-${testRunId}`,
    studentA: `e2e-att-student-a-${testRunId}`,
    studentB: `e2e-att-student-b-${testRunId}`,
    slot: `e2e-att-slot-${testRunId}`,
  };
  const names = { studentA: `Élève Présence A ${testRunId}`, studentB: `Élève Présence B ${testRunId}` };
  let serviceAccount;
  try { serviceAccount = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT); } catch { throw new Error('Invalid Staging service account JSON.'); }
  assert.equal(serviceAccount.project_id, EXPECTED_PROJECT);

  const adminApp = initializeAdminApp({ credential: cert(serviceAccount) }, `attendance-admin-${testRunId}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const firebaseRequests = [];
  const pages = [];
  const clientApps = [];
  let schoolId = '';
  let academicYearId = '';
  let canonicalIds = [];

  try {
    const precheck = await configurePage(browser, appUrl, firebaseRequests);
    pages.push(precheck);
    const stagingRequest = precheck.page.waitForRequest(request => classifyFirebaseRequest(request.url()).staging, { timeout: 30_000 });
    await precheck.page.goto(`${appUrl}/#/diagnostic`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: precheck.page.url() });
    await precheck.page.getByTestId('diagnostic-firebase-project').waitFor({ state: 'visible', timeout: 30_000 });
    const runtimeProject = (await precheck.page.getByTestId('diagnostic-firebase-project').textContent())?.trim() || '';
    assertStagingRuntimeProject(runtimeProject);
    await precheck.page.evaluate(async url => fetch(url, { method: 'GET', credentials: 'omit' }).catch(() => undefined),
      `https://firestore.googleapis.com/v1/projects/${EXPECTED_PROJECT}/databases/(default)/documents/__e2e_precheck__/attendance`);
    await stagingRequest;
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequests });

    const profiles = {};
    for (const [role, email] of Object.entries(ACCOUNTS)) {
      const account = await adminAuth.getUserByEmail(email);
      const profile = await db.collection('users').doc(account.uid).get();
      assert.equal(profile.exists, true, `${role} profile missing`);
      profiles[role] = { uid: account.uid, ...profile.data() };
    }
    assert.equal(profiles.owner.role, 'owner');
    assert.equal(profiles.secretary.role, 'secretary');
    assert.equal(profiles.teacher.role, 'teacher');
    schoolId = String(profiles.owner.schoolId || '');
    assert.equal(profiles.secretary.schoolId, schoolId);
    assert.equal(profiles.teacher.schoolId, schoolId);
    const school = await db.collection('schools').doc(schoolId).get();
    academicYearId = String(school.data()?.activeAcademicYearId || school.data()?.academicYear || '');
    assert.ok(schoolId && academicYearId, 'Canonical school/year pointers are required.');
    const teacherLink = await db.collection('staffUserLinkByUser').doc(profiles.teacher.uid).get();
    assert.equal(teacherLink.exists, true, 'Teacher staff link missing.');
    assert.equal(teacherLink.data()?.isActive, true, 'Teacher staff link inactive.');
    const teacherStaffId = String(teacherLink.data()?.staffId || '');
    assert.ok(teacherStaffId);

    const fixture = { testFixture: true, testRunId, createdAt: FieldValue.serverTimestamp() };
    await Promise.all([
      db.collection('classes').doc(ids.classA).create({ id: ids.classA, schoolId, name: `ITALO Attendance A ${testRunId}`, section: 'francophone', type: 'francophone', isActive: true, ...fixture }),
      db.collection('classes').doc(ids.classB).create({ id: ids.classB, schoolId, name: `ITALO Attendance B ${testRunId}`, section: 'francophone', type: 'francophone', isActive: true, ...fixture }),
      db.collection('students').doc(ids.studentA).create({ id: ids.studentA, schoolId, classId: ids.classA, name: names.studentA, section: 'francophone', schoolingStatus: 'active', active: true, ...fixture }),
      db.collection('students').doc(ids.studentB).create({ id: ids.studentB, schoolId, classId: ids.classB, name: names.studentB, section: 'francophone', schoolingStatus: 'active', active: true, ...fixture }),
      db.collection('teacherAssignmentSlots').doc(ids.slot).create({ id: ids.slot, assignmentId: ids.slot, schoolId, academicYearId, classId: ids.classA, subjectId: 'fixture-subject', teacherStaffId, teacherUserId: profiles.teacher.uid, assignmentRole: 'primary', sourceProgramId: 'fixture', sourcePublishedRevisionId: 'fixture', sourceClassSubjectId: 'fixture', isActive: true, updatedAt: new Date().toISOString(), updatedBy: profiles.owner.uid, ...fixture }),
    ]);

    const clients = {};
    for (const [role, email] of Object.entries(ACCOUNTS)) {
      const app = initializeApp(firebaseConfig(), `attendance-${role}-${testRunId}`);
      clientApps.push(app);
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, email, process.env.STAGING_TEST_ALPHA_PASSWORD);
      clients[role] = { auth, call: httpsCallable(getFunctions(app, 'us-central1'), 'recordStudentAttendance') };
    }

    canonicalIds = [ids.studentA, ids.studentB].map(studentId => attendanceId(schoolId, academicYearId, date, studentId));
    console.log('CALLABLE: secretary allow, teacher assigned allow, teacher other class deny');
    await clients.secretary.call({ studentId: ids.studentA, date, status: 'present' });
    await clients.teacher.call({ studentId: ids.studentA, date, status: 'late' });
    await callableFailure(() => clients.teacher.call({ studentId: ids.studentB, date, status: 'present' }), 'permission-denied');

    console.log('CONCURRENCY: one deterministic document and one final state');
    await Promise.all([
      clients.owner.call({ studentId: ids.studentB, date, status: 'present' }),
      clients.secretary.call({ studentId: ids.studentB, date, status: 'absent', note: 'Fixture correction' }),
    ]);
    const sameDayRows = await db.collection('attendance').where('testRunId', '==', testRunId).get();
    assert.equal(sameDayRows.size, 2);
    assert.equal(sameDayRows.docs.filter(row => row.data().studentId === ids.studentB).length, 1);

    console.log('UI SECRETARY: PRESENT, reload, ABSENT correction, reload');
    const secretaryUi = await configurePage(browser, appUrl, firebaseRequests);
    pages.push(secretaryUi);
    await login(secretaryUi.page, appUrl, ACCOUNTS.secretary);
    await secretaryUi.page.locator('input[type="date"]').fill(date);
    await secretaryUi.page.locator('select').filter({ has: secretaryUi.page.locator(`option[value="${ids.classA}"]`) }).selectOption(ids.classA);
    await secretaryUi.page.getByRole('button', { name: `Marquer ${names.studentA} présent` }).click();
    await secretaryUi.page.getByRole('status').waitFor({ timeout: 20_000 });
    await secretaryUi.page.reload({ waitUntil: 'domcontentloaded' });
    await secretaryUi.page.getByRole('button', { name: `Marquer ${names.studentA} présent` }).waitFor({ timeout: 20_000 });
    assert.equal((await db.collection('attendance').doc(canonicalIds[0]).get()).data()?.status, 'present');
    await secretaryUi.page.getByRole('button', { name: `Marquer ${names.studentA} absent` }).click();
    await secretaryUi.page.getByRole('button', { name: 'Valider' }).click();
    await secretaryUi.page.getByRole('status').waitFor({ timeout: 20_000 });
    await secretaryUi.page.reload({ waitUntil: 'domcontentloaded' });
    await secretaryUi.page.getByRole('button', { name: `Marquer ${names.studentA} absent` }).waitFor({ timeout: 20_000 });
    assert.equal((await db.collection('attendance').doc(canonicalIds[0]).get()).data()?.status, 'absent');

    console.log('UI TEACHER: assigned class visible; other class and student hidden');
    const teacherUi = await configurePage(browser, appUrl, firebaseRequests);
    pages.push(teacherUi);
    await login(teacherUi.page, appUrl, ACCOUNTS.teacher);
    await teacherUi.page.locator('input[type="date"]').fill(date);
    const teacherClassSelect = teacherUi.page.locator('select').filter({ has: teacherUi.page.locator(`option[value="${ids.classA}"]`) });
    await teacherClassSelect.selectOption(ids.classA);
    await teacherUi.page.getByText(names.studentA, { exact: false }).waitFor({ timeout: 20_000 });
    assert.equal(await teacherUi.page.locator(`option[value="${ids.classB}"]`).count(), 0);
    assert.equal(await teacherUi.page.getByText(names.studentB, { exact: false }).count(), 0);

    console.log('RESPONSIVE: 360, 768, 1440');
    for (const width of [360, 768, 1440]) {
      await secretaryUi.page.setViewportSize({ width, height: 900 });
      await secretaryUi.page.goto(`${appUrl}/#/attendance`, { waitUntil: 'domcontentloaded' });
      await secretaryUi.page.locator('input[type="date"]').waitFor({ state: 'visible', timeout: 20_000 });
      assert.equal(await secretaryUi.page.locator('input[type="date"]').isVisible(), true);
      assert.equal(await secretaryUi.page.locator(`option[value="${ids.classA}"]`).count(), 1);
      await secretaryUi.page.locator('select').filter({ has: secretaryUi.page.locator(`option[value="${ids.classA}"]`) }).selectOption(ids.classA);
      assert.equal(await secretaryUi.page.getByRole('button', { name: `Marquer ${names.studentA} présent` }).isVisible(), true);
      console.log(`RESPONSIVE ${width}: PASS`);
    }
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequests });
    console.log('ITALO-W1-02 ATTENDANCE LIVE E2E: PASS');
  } finally {
    console.log(`CLEANUP exact testRunId=${testRunId}`);
    for (const app of clientApps) {
      try { if (getAuth(app).currentUser) await signOut(getAuth(app)); await deleteApp(app); } catch { /* continue */ }
    }
    const collections = ['attendance', 'audit_logs', 'teacherAssignmentSlots', 'students', 'classes'];
    for (const collectionName of collections) {
      const snapshot = await db.collection(collectionName).where('testRunId', '==', testRunId).get();
      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(document => batch.delete(document.ref));
        await batch.commit();
      }
    }
    const residualSnapshots = await Promise.all(collections.map(name => db.collection(name).where('testRunId', '==', testRunId).get()));
    const orphanSnapshots = await Promise.all(canonicalIds.map(id => db.collection('audit_logs').where('attendanceId', '==', id).get()));
    const residuals = residualSnapshots.reduce((sum, snapshot) => sum + snapshot.size, 0);
    const orphans = orphanSnapshots.reduce((sum, snapshot) => sum + snapshot.size, 0);
    console.log(`CLEANUP residuals=${residuals} orphans=${orphans}`);
    assert.equal(residuals, 0);
    assert.equal(orphans, 0);
    for (const item of pages) await item.context.close();
    await browser.close();
    await deleteAdminApp(adminApp);
  }
};

run().catch(error => {
  let redacted = String(error?.stack || error);
  for (const name of REQUIRED_ENV) {
    if (name === 'STAGING_APP_URL') continue;
    const secret = process.env[name];
    if (secret && secret.length >= 4) redacted = redacted.split(secret).join('[REDACTED]');
  }
  console.error(redacted);
  process.exitCode = 1;
});
