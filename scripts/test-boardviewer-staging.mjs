import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { chromium } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { deleteDoc, doc, getDoc, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
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
  'STAGING_APP_URL',
  'STAGING_FIREBASE_SERVICE_ACCOUNT',
  'STAGING_FIREBASE_API_KEY',
  'STAGING_FIREBASE_AUTH_DOMAIN',
  'STAGING_FIREBASE_PROJECT_ID',
  'STAGING_FIREBASE_STORAGE_BUCKET',
  'STAGING_FIREBASE_MESSAGING_SENDER_ID',
  'STAGING_FIREBASE_APP_ID',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
];

const RAW_DENY_COLLECTIONS = [
  'academicYears', 'periods', 'classes', 'students', 'studentPrivate', 'studentFinance',
  'studentParentPrivate', 'studentParentFinance', 'staff', 'attendance', 'staffAttendance',
  'subjects', 'programs', 'classPrograms', 'teacherAssignments', 'evaluations', 'grades',
  'payments', 'receipts', 'expenses', 'transactions', 'financialBenefits', 'cashClosures',
  'buses', 'busRoutes', 'fuelExpenses', 'maintenances', 'breakdowns', 'inventory',
  'inventoryTransactions', 'validation_requests', 'audit_logs',
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

const expectDenied = async (operation, label) => {
  try {
    await operation();
    assert.fail(`${label}: operation unexpectedly succeeded.`);
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    assert.match(String(error?.code || error?.message || ''), /permission-denied|unauthenticated/i,
      `${label}: unexpected failure ${error?.code || error?.message || 'unknown'}`);
  }
};

const assertNoPersonalData = (summary, fixtureTokens) => {
  const serialized = JSON.stringify(summary);
  for (const forbiddenKey of [
    'email', 'phone', 'birthDate', 'address', 'bank', 'parentName', 'parentPhone',
    'studentId', 'staffId', 'userId', 'receiptNumber', 'benefitId',
  ]) {
    assert.equal(serialized.includes(`\"${forbiddenKey}\"`), false,
      `Aggregate response leaked ${forbiddenKey}.`);
  }
  for (const token of fixtureTokens) {
    assert.equal(serialized.includes(token), false, 'Aggregate response leaked an individual fixture token.');
  }
};

const run = async () => {
  const appUrl = requireEnvironment();
  const runToken = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '1').replace(/[^A-Za-z0-9_-]/g, '-');
  const suffix = `${runToken}-${attempt}`;
  const schoolA = `e2e-board-school-a-${suffix}`;
  const schoolB = `e2e-board-school-b-${suffix}`;
  const sampleA = `e2e-board-sample-a-${suffix}`;
  const sampleB = `e2e-board-sample-b-${suffix}`;
  const createdId = `e2e-board-created-${suffix}`;
  const notificationOwn = `e2e-board-notification-own-${suffix}`;
  const notificationOther = `e2e-board-notification-other-${suffix}`;
  const roleFixtures = [
    { key: 'board', role: 'boardViewer', schoolId: schoolA },
    { key: 'owner', role: 'owner', schoolId: schoolA },
    { key: 'secretary', role: 'secretary', schoolId: schoolA },
    { key: 'random', role: 'teacher', schoolId: schoolA },
  ].map((item) => ({
    ...item,
    uid: `e2e-board-${item.key}-${suffix}`.slice(0, 128),
    email: `e2e-board-${item.key}-${suffix}@example.test`.toLowerCase(),
    password: `T!${crypto.randomBytes(30).toString('base64url')}`,
  }));
  const board = roleFixtures.find((item) => item.key === 'board');
  const owner = roleFixtures.find((item) => item.key === 'owner');
  const secretary = roleFixtures.find((item) => item.key === 'secretary');
  const random = roleFixtures.find((item) => item.key === 'random');

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT);
  } catch {
    throw new Error('STAGING_FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
  }
  if (serviceAccount.project_id !== EXPECTED_PROJECT) {
    throw new Error('Refusing to run: the service account does not target staging.');
  }

  const adminApp = initializeAdminApp({ credential: cert(serviceAccount) }, `board-e2e-admin-${suffix}`);
  const adminDb = getAdminFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const clientApp = initializeApp({
    apiKey: process.env.STAGING_FIREBASE_API_KEY,
    authDomain: process.env.STAGING_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
    storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.STAGING_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.STAGING_FIREBASE_APP_ID,
  }, `board-e2e-client-${suffix}`);
  const clientAuth = getAuth(clientApp);
  const clientDb = getFirestore(clientApp);
  const callable = httpsCallable(getFunctions(clientApp, 'us-central1'), 'getBoardViewerGovernanceSummary');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  const firebaseRequestUrls = [];
  const browserErrors = [];
  page.on('request', (request) => {
    if (classifyFirebaseRequest(request.url()).relevant) firebaseRequestUrls.push(request.url());
  });
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.route(`${appUrl}/**`, async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        'x-vercel-set-bypass-cookie': 'true',
      },
    });
  });

  const fixtureRefs = [];
  const addFixture = async (collectionName, id, data) => {
    const ref = adminDb.collection(collectionName).doc(id);
    assert.equal((await ref.get()).exists, false, `Refusing to overwrite ${collectionName}/${id}.`);
    await ref.create({ ...data, testFixture: true, testRunId: suffix });
    fixtureRefs.push(ref);
  };

  try {
    console.log('PRECHECK: immutable Preview and Firebase staging routing');
    const stagingRequest = page.waitForRequest(
      (request) => classifyFirebaseRequest(request.url()).staging,
      { timeout: 30_000 },
    );
    await page.goto(`${appUrl}/#/diagnostic`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: page.url() });
    await page.getByTestId('diagnostic-firebase-project').waitFor({ state: 'visible', timeout: 30_000 });
    const runtimeProject = (await page.getByTestId('diagnostic-firebase-project').textContent())?.trim() || '';
    assertStagingRuntimeProject(runtimeProject);
    const probe = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(runtimeProject)}/databases/(default)/documents/__e2e_precheck__/network-probe`;
    await page.evaluate(async (url) => {
      await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit' }).catch(() => undefined);
    }, probe);
    await stagingRequest;
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequestUrls });

    console.log('FIXTURES: creating exact, isolated BoardViewer staging records');
    for (const account of roleFixtures) {
      await adminAuth.createUser({ uid: account.uid, email: account.email, password: account.password,
        emailVerified: true, disabled: false });
      await addFixture('users', account.uid, {
        id: account.uid, email: account.email, name: `E2E ${account.key} ${suffix}`,
        role: account.role, schoolId: account.schoolId, active: true, isActive: true,
      });
    }
    await addFixture('schools', schoolA, {
      id: schoolA, name: `E2E Board School A ${suffix}`, academicYear: '2026-2027',
      activeAcademicYearId: sampleA, studentsCount: 1, status: 'active', isActive: true,
    });
    await addFixture('schools', schoolB, {
      id: schoolB, name: `E2E Board School B ${suffix}`, academicYear: '2026-2027',
      activeAcademicYearId: sampleB, studentsCount: 2, status: 'active', isActive: true,
    });
    await addFixture('notifications', notificationOwn, {
      id: notificationOwn, schoolId: schoolA, userId: board.uid, message: 'E2E aggregate ready', read: false,
    });
    await addFixture('notifications', notificationOther, {
      id: notificationOther, schoolId: schoolA, userId: owner.uid, message: 'E2E private owner message', read: false,
    });
    for (const collectionName of RAW_DENY_COLLECTIONS) {
      await addFixture(collectionName, sampleA, {
        id: sampleA, schoolId: schoolA, userId: board.uid, studentId: sampleA,
        classId: sampleA, staffId: sampleA, name: `A-${collectionName}-${suffix}`,
        status: collectionName === 'grades' || collectionName === 'classPrograms' ? 'published' : 'active',
        published: collectionName === 'grades' || collectionName === 'classPrograms',
        isActive: true, amount: collectionName === 'payments' ? 1100 : 100,
        score: 10, maxScore: 20, quantity: 2, minimumStock: 5,
      });
      await addFixture(collectionName, sampleB, {
        id: sampleB, schoolId: schoolB, userId: 'cross-school-canary', studentId: sampleB,
        classId: sampleB, staffId: sampleB, name: `B-${collectionName}-${suffix}`,
        status: collectionName === 'grades' || collectionName === 'classPrograms' ? 'published' : 'active',
        published: collectionName === 'grades' || collectionName === 'classPrograms',
        isActive: true, amount: collectionName === 'payments' ? 990000 : 900,
        score: 20, maxScore: 20, quantity: 90, minimumStock: 1,
      });
    }

    console.log('AUTHENTICATION AND DEPLOYED RULES: BoardViewer direct access boundary');
    const boardCredential = await signInWithEmailAndPassword(clientAuth, board.email, board.password);
    assert.equal(boardCredential.user.uid, board.uid);
    assert.equal((await getDoc(doc(clientDb, 'users', board.uid))).exists(), true);
    assert.equal((await getDoc(doc(clientDb, 'schools', schoolA))).exists(), true);
    assert.equal((await getDoc(doc(clientDb, 'notifications', notificationOwn))).exists(), true);
    await expectDenied(() => getDoc(doc(clientDb, 'users', owner.uid)), 'other user read');
    await expectDenied(() => getDoc(doc(clientDb, 'schools', schoolB)), 'cross-school read');
    await expectDenied(() => getDoc(doc(clientDb, 'notifications', notificationOther)), 'other notification read');
    await expectDenied(() => updateDoc(doc(clientDb, 'users', board.uid), { name: 'forbidden' }), 'own profile update');
    await expectDenied(() => updateDoc(doc(clientDb, 'schools', schoolA), { name: 'forbidden' }), 'school update');
    await expectDenied(() => setDoc(doc(clientDb, 'schools', createdId), {
      id: createdId, schoolId: schoolA, name: 'forbidden', testFixture: true, testRunId: suffix,
    }), 'school create');
    await expectDenied(() => deleteDoc(doc(clientDb, 'schools', schoolA)), 'school delete');
    await expectDenied(() => updateDoc(doc(clientDb, 'notifications', notificationOwn), { read: true }), 'notification update');
    await expectDenied(() => deleteDoc(doc(clientDb, 'notifications', notificationOwn)), 'notification delete');
    await expectDenied(() => setDoc(doc(clientDb, 'notifications', createdId), {
      id: createdId, schoolId: schoolA, userId: board.uid, testFixture: true, testRunId: suffix,
    }), 'notification create');
    for (const collectionName of RAW_DENY_COLLECTIONS) {
      await expectDenied(() => getDoc(doc(clientDb, collectionName, sampleA)), `${collectionName} raw read`);
      await expectDenied(() => getDoc(doc(clientDb, collectionName, sampleB)), `${collectionName} cross-school read`);
      await expectDenied(() => setDoc(doc(clientDb, collectionName, createdId), {
        id: createdId, schoolId: schoolA, userId: board.uid, status: 'pending',
        testFixture: true, testRunId: suffix,
      }), `${collectionName} create`);
      await expectDenied(() => updateDoc(doc(clientDb, collectionName, sampleA), { boardMutation: true }),
        `${collectionName} update/approve`);
      await expectDenied(() => deleteDoc(doc(clientDb, collectionName, sampleA)), `${collectionName} delete`);
    }
    console.log(`DEPLOYED RULES: PASS (${RAW_DENY_COLLECTIONS.length} raw collections, all writes denied)`);

    console.log('AGGREGATE CALLABLE: auth, trusted school and privacy');
    const summary = (await callable({ schoolId: schoolB })).data;
    assert.equal(summary.school.id, schoolA, 'Callable trusted an arbitrary client schoolId.');
    assert.equal(summary.students.active, 1);
    assert.equal(summary.finance.collected, 1100);
    assert.equal(summary.finance.expenses, 100);
    assert.equal(summary.attendance.records, 1);
    assertNoPersonalData(summary, [sampleA, sampleB, board.uid, 'cross-school-canary', '990000']);
    await signOut(clientAuth);
    await expectDenied(() => callable({}), 'unauthenticated aggregate');
    for (const account of [secretary, random]) {
      await signInWithEmailAndPassword(clientAuth, account.email, account.password);
      await expectDenied(() => callable({}), `${account.role} aggregate`);
      await signOut(clientAuth);
    }
    console.log('AGGREGATE CALLABLE: PASS (server role, trusted school, no personal data)');

    console.log('BOARDVIEWER UI: login, dashboard, responsive sanity and logout');
    await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email').fill(board.email);
    await page.getByTestId('login-password').fill(board.password);
    await page.getByTestId('login-submit').click();
    await page.getByRole('heading', { name: 'Synthèse de gouvernance' })
      .waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByText('Accès en consultation uniquement').waitFor({ state: 'visible' });
    await page.getByText('Aucun dossier individuel n’est exposé.').waitFor({ state: 'visible' });
    assert.equal((await page.locator('[data-testid^="nav-"]').allTextContents()).join(' ').trim(), 'Tableau de bord');
    const body = await page.locator('body').innerText();
    for (const token of [sampleA, sampleB, board.email, owner.email, 'cross-school-canary', '990000']) {
      assert.equal(body.includes(token), false, 'Dashboard exposed a private or cross-school fixture token.');
    }
    for (const viewport of [
      { width: 360, height: 800, label: 'MOBILE 360' },
      { width: 768, height: 900, label: 'TABLET 768' },
      { width: 1440, height: 1000, label: 'DESKTOP 1440' },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.getByRole('heading', { name: 'Synthèse de gouvernance' }).waitFor({ state: 'visible' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 4, `${viewport.label}: critical horizontal overflow (${overflow}px).`);
      console.log(`${viewport.label}: PASS`);
    }
    assert.equal(browserErrors.filter((message) => /permission|uncaught|firestore/i.test(message)).length, 0,
      `BoardViewer dashboard emitted permission/runtime errors: ${browserErrors.join(' | ')}`);
    page.once('dialog', (dialog) => dialog.accept());
    if (await page.getByRole('button', { name: 'Ouvrir le menu principal' }).isVisible()) {
      await page.getByRole('button', { name: 'Ouvrir le menu principal' }).click();
    }
    await page.getByTestId('logout-button').click();
    await page.getByTestId('login-submit').waitFor({ state: 'visible', timeout: 20_000 });
    console.log('BOARDVIEWER LOGIN/LOGOUT/DASHBOARD: PASS');

    const assertRoleUi = async (account, paths) => {
      await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('login-email').fill(account.email);
      await page.getByTestId('login-password').fill(account.password);
      await page.getByTestId('login-submit').click();
      await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 20_000 });
      for (const path of paths) {
        await page.goto(`${appUrl}/#${path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(750);
        assert.equal(await page.getByTestId('login-submit').count(), 0, `${account.role} was logged out on ${path}.`);
        const pageText = await page.locator('body').innerText();
        assert.equal(/Accès refusé/i.test(pageText), false, `${account.role} was denied on ${path}.`);
        assert.ok(pageText.trim().length > 50, `${account.role} rendered a blank page on ${path}.`);
      }
      page.once('dialog', (dialog) => dialog.accept());
      if (await page.getByRole('button', { name: 'Ouvrir le menu principal' }).isVisible()) {
        await page.getByRole('button', { name: 'Ouvrir le menu principal' }).click();
      }
      await page.getByTestId('logout-button').click();
      await page.getByTestId('login-submit').waitFor({ state: 'visible', timeout: 20_000 });
    };
    await assertRoleUi(owner, ['/', '/students', '/payments', '/settings']);
    console.log('OWNER UI REGRESSION: PASS');
    await assertRoleUi(secretary, ['/', '/students', '/payments']);
    console.log('SECRETARY UI REGRESSION: PASS');
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequestUrls });
    console.log('BOARDVIEWER STAGING E2E: PASS');
  } finally {
    console.log('CLEANUP: deleting only exact BoardViewer E2E fixture IDs');
    try {
      if (clientAuth.currentUser) await signOut(clientAuth).catch(() => undefined);
      for (const ref of [...fixtureRefs].reverse()) {
        const snapshot = await ref.get();
        if (!snapshot.exists) continue;
        assert.equal(snapshot.data()?.testFixture, true, `Refusing to delete non-fixture ${ref.path}.`);
        assert.equal(snapshot.data()?.testRunId, suffix, `Refusing to delete foreign fixture ${ref.path}.`);
        await ref.delete();
      }
      for (const collectionName of ['schools', 'notifications', ...RAW_DENY_COLLECTIONS]) {
        const ref = adminDb.collection(collectionName).doc(createdId);
        const snapshot = await ref.get();
        if (!snapshot.exists) continue;
        assert.equal(snapshot.data()?.testFixture, true, `Refusing to delete non-fixture ${ref.path}.`);
        assert.equal(snapshot.data()?.testRunId, suffix, `Refusing to delete foreign fixture ${ref.path}.`);
        await ref.delete();
      }
      for (const account of roleFixtures) {
        const user = await adminAuth.getUser(account.uid).catch((error) => error?.code === 'auth/user-not-found' ? null : Promise.reject(error));
        if (!user) continue;
        assert.equal(user.email, account.email, `Refusing to delete unexpected Auth user ${account.uid}.`);
        await adminAuth.deleteUser(account.uid);
      }
      const residualDocs = [];
      for (const ref of fixtureRefs) {
        if ((await ref.get()).exists) residualDocs.push(ref.path);
      }
      for (const collectionName of ['schools', 'notifications', ...RAW_DENY_COLLECTIONS]) {
        const ref = adminDb.collection(collectionName).doc(createdId);
        if ((await ref.get()).exists) residualDocs.push(ref.path);
      }
      const residualUsers = [];
      for (const account of roleFixtures) {
        const exists = await adminAuth.getUser(account.uid)
          .then(() => true)
          .catch((error) => error?.code === 'auth/user-not-found' ? false : Promise.reject(error));
        if (exists) residualUsers.push(account.uid);
      }
      assert.deepEqual(residualDocs, []);
      assert.deepEqual(residualUsers, []);
      console.log('STAGING FIXTURE CLEANUP: PASS');
      console.log('STAGING ORPHANS: 0');
    } finally {
      await context.close();
      await browser.close();
      await deleteApp(clientApp);
      await deleteAdminApp(adminApp);
    }
  }
};

run().catch((error) => {
  const secrets = [
    ...REQUIRED_ENV.map((name) => process.env[name]),
  ].filter((value) => typeof value === 'string' && value.length >= 4);
  let message = String(error?.stack || error?.message || error);
  for (const secret of secrets) message = message.split(secret).join('[REDACTED]');
  console.error(message);
  process.exitCode = 1;
});
