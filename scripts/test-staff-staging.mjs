import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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

const PROJECT = 'ecoscolaire-staging';
const REQUIRED_ENV = [
  'STAGING_APP_URL', 'STAGING_FIREBASE_SERVICE_ACCOUNT', 'STAGING_TEST_ALPHA_PASSWORD',
  'STAGING_FIREBASE_API_KEY', 'STAGING_FIREBASE_AUTH_DOMAIN', 'STAGING_FIREBASE_PROJECT_ID',
  'STAGING_FIREBASE_STORAGE_BUCKET', 'STAGING_FIREBASE_MESSAGING_SENDER_ID',
  'STAGING_FIREBASE_APP_ID', 'VERCEL_AUTOMATION_BYPASS_SECRET',
];
const ACTORS = {
  owner: 'owner.alpha@ecoscolaire.com',
  secretary: 'secretary.alpha@ecoscolaire.com',
};

const requireEnvironment = () => {
  const missing = REQUIRED_ENV.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing staging secrets: ${missing.join(', ')}`);
  assert.equal(process.env.STAGING_FIREBASE_PROJECT_ID, PROJECT);
  assertAutomationBypassSecret(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  const url = new URL(process.env.STAGING_APP_URL);
  assert.equal(url.protocol, 'https:');
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

const callableFailure = async (operation, code) => assert.rejects(operation, error => {
  assert.equal(error?.code, `functions/${code}`);
  return true;
});

const waitForServerState = async (description, predicate, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
};

const configurePage = async (browser, appUrl, requestUrls, testRunId) => {
  const context = await browser.newContext();
  await context.addInitScript(runId => {
    window.sessionStorage.setItem('ECOSCOLAIRE_STAFF_TEST_RUN_ID', runId);
  }, testRunId);
  const page = await context.newPage();
  page.on('dialog', async dialog => {
    console.log(`BROWSER_DIALOG ${dialog.type()}: ${dialog.message()}`);
    await dialog.accept();
  });
  page.on('console', message => {
    if (message.type() === 'error') console.log(`BROWSER_ERROR ${message.text()}`);
  });
  await page.route(`${appUrl}/**`, route => route.continue({
    headers: {
      ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'x-vercel-set-bypass-cookie': 'true',
    },
  }));
  page.on('request', request => {
    if (classifyFirebaseRequest(request.url()).relevant) requestUrls.push(request.url());
  });
  return { context, page };
};

const loginStaff = async (page, appUrl, email) => {
  await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(process.env.STAGING_TEST_ALPHA_PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 30_000 });
  await page.goto(`${appUrl}/#/staff`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Personnel|Staff/i }).waitFor({ timeout: 30_000 });
};

const run = async () => {
  const appUrl = requireEnvironment();
  const token = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const testRunId = `italo-w1-04-${token}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  const password = `T!${randomBytes(18).toString('base64url')}9a`;
  const fixture = { testFixture: true, testRunId };
  let serviceAccount;
  try { serviceAccount = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT); } catch { throw new Error('Invalid staging service account JSON.'); }
  assert.equal(serviceAccount.project_id, PROJECT);

  const adminApp = initializeAdminApp({ credential: cert(serviceAccount) }, `staff-admin-${testRunId}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const requestUrls = [];
  const pages = [];
  const clientApps = [];
  const fixtureAuthUids = [];
  let schoolId = '';

  try {
    const precheck = await configurePage(browser, appUrl, requestUrls, testRunId);
    pages.push(precheck);
    const stagingRequest = precheck.page.waitForRequest(request => classifyFirebaseRequest(request.url()).staging, { timeout: 30_000 });
    await precheck.page.goto(`${appUrl}/#/diagnostic`, { waitUntil: 'domcontentloaded' });
    assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: precheck.page.url() });
    const projectLabel = precheck.page.getByTestId('diagnostic-firebase-project');
    await projectLabel.waitFor({ state: 'visible', timeout: 30_000 });
    const runtimeProject = (await projectLabel.textContent())?.trim() || '';
    assertStagingRuntimeProject(runtimeProject);
    await precheck.page.evaluate(async project => fetch(
      `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/__e2e_precheck__/staff`,
      { method: 'GET', credentials: 'omit' },
    ).catch(() => undefined), PROJECT);
    await stagingRequest;
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls });

    const actorProfiles = {};
    for (const [role, email] of Object.entries(ACTORS)) {
      const account = await adminAuth.getUserByEmail(email);
      const profile = await db.collection('users').doc(account.uid).get();
      assert.equal(profile.exists, true);
      actorProfiles[role] = { uid: account.uid, ...profile.data() };
    }
    schoolId = String(actorProfiles.owner.schoolId || '');
    assert.ok(schoolId);
    assert.equal(actorProfiles.secretary.schoolId, schoolId);

    const targetSpecs = [
      ['teacher-a', 'teacher'], ['teacher-b', 'teacher'], ['teacher-c', 'teacher'],
      ['driver-a', 'driver'],
    ];
    const targetUsers = {};
    for (const [label, role] of targetSpecs) {
      const email = `${label}.${testRunId}@example.test`;
      const account = await adminAuth.createUser({ email, password, emailVerified: true, disabled: false });
      fixtureAuthUids.push(account.uid);
      await db.collection('users').doc(account.uid).create({
        id: account.uid, email, role, schoolId, isActive: true, active: true,
        createdAt: FieldValue.serverTimestamp(), ...fixture,
      });
      targetUsers[label] = { uid: account.uid, email, role };
    }
    const crossAccount = await adminAuth.createUser({
      email: `cross.${testRunId}@example.test`, password, emailVerified: true, disabled: false,
    });
    fixtureAuthUids.push(crossAccount.uid);
    await db.collection('users').doc(crossAccount.uid).create({
      id: crossAccount.uid, email: `cross.${testRunId}@example.test`, role: 'teacher',
      schoolId: 'cross-school-fixture', isActive: true, active: true,
      createdAt: FieldValue.serverTimestamp(), ...fixture,
    });
    const crossStaffId = `cross-staff-${testRunId}`;
    await db.collection('staff').doc(crossStaffId).create({
      id: crossStaffId, schoolId: 'cross-school-fixture', firstName: 'Cross', lastName: 'Fixture',
      staffType: 'teacher', employmentStatus: 'active', isActive: true,
      createdAt: FieldValue.serverTimestamp(), ...fixture,
    });

    const clients = {};
    for (const [role, email] of Object.entries(ACTORS)) {
      const app = initializeApp(firebaseConfig(), `staff-${role}-${testRunId}`);
      clientApps.push(app);
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, email, process.env.STAGING_TEST_ALPHA_PASSWORD);
      const functions = getFunctions(app, 'us-central1');
      clients[role] = {
        auth,
        manage: httpsCallable(functions, 'manageStaff'),
        link: httpsCallable(functions, 'linkStaffToUser'),
        unlink: httpsCallable(functions, 'unlinkStaffFromUser'),
      };
    }

    console.log('UI lifecycle: create, reload, edit, deactivate, reactivate');
    const secretaryUi = await configurePage(browser, appUrl, requestUrls, testRunId);
    pages.push(secretaryUi);
    await loginStaff(secretaryUi.page, appUrl, ACTORS.secretary);
    await secretaryUi.page.getByRole('button', { name: /Ajouter|add/i }).click();
    await secretaryUi.page.getByLabel('Nom', { exact: true }).fill(`Staff-${testRunId}`);
    await secretaryUi.page.getByLabel('Prénom', { exact: true }).fill('Fixture');
    await secretaryUi.page.getByRole('button', { name: /Enregistrer|Sauvegarder|save/i }).click();
    await secretaryUi.page.getByLabel('Nom', { exact: true }).waitFor({ state: 'hidden', timeout: 30_000 });
    let staffRows = await db.collection('staff').where('testRunId', '==', testRunId).where('schoolId', '==', schoolId).get();
    assert.equal(staffRows.size, 1);
    const uiStaffId = staffRows.docs[0].id;
    await secretaryUi.page.reload({ waitUntil: 'domcontentloaded' });
    let row = secretaryUi.page.locator('tr', { hasText: `Staff-${testRunId}` });
    await row.waitFor({ timeout: 30_000 });
    await row.getByTestId(`edit-btn-${uiStaffId}`).click();
    await secretaryUi.page.getByLabel('Prénom', { exact: true }).fill('Fixture-Modifiée');
    await secretaryUi.page.getByRole('button', { name: /Enregistrer|Sauvegarder|save/i }).click();
    await waitForServerState('Staff update confirmation', async () =>
      (await db.collection('staff').doc(uiStaffId).get()).data()?.firstName === 'Fixture-Modifiée'
    );
    await secretaryUi.page.reload({ waitUntil: 'domcontentloaded' });
    row = secretaryUi.page.locator('tr', { hasText: `Staff-${testRunId}` });
    await row.getByText('Fixture-Modifiée', { exact: false }).waitFor({ timeout: 30_000 });
    await row.getByTestId(`deact-btn-${uiStaffId}`).click();
    await waitForServerState('Staff deactivation confirmation', async () =>
      (await db.collection('staff').doc(uiStaffId).get()).data()?.isActive === false
    );
    await secretaryUi.page.reload({ waitUntil: 'domcontentloaded' });
    row = secretaryUi.page.locator('tr', { hasText: `Staff-${testRunId}` });
    await row.getByTestId(`reactivate-btn-${uiStaffId}`).waitFor({ timeout: 30_000 });
    await row.getByTestId(`reactivate-btn-${uiStaffId}`).click();
    await waitForServerState('Staff reactivation confirmation', async () =>
      (await db.collection('staff').doc(uiStaffId).get()).data()?.isActive === true
    );
    await secretaryUi.page.reload({ waitUntil: 'domcontentloaded' });
    await secretaryUi.page.locator('tr', { hasText: `Staff-${testRunId}` }).getByTestId(`deact-btn-${uiStaffId}`).waitFor({ timeout: 30_000 });

    console.log('UI account link and unlink with entity preservation');
    const ownerUi = await configurePage(browser, appUrl, requestUrls, testRunId);
    pages.push(ownerUi);
    await loginStaff(ownerUi.page, appUrl, ACTORS.owner);
    row = ownerUi.page.locator('tr', { hasText: `Staff-${testRunId}` });
    await row.getByRole('button', { name: 'Lier un compte' }).click();
    await ownerUi.page.getByLabel('Compte actif de la même école').selectOption(targetUsers['teacher-a'].uid);
    await ownerUi.page.getByRole('button', { name: 'Confirmer la liaison' }).click();
    await waitForServerState('Staff account link confirmation', async () =>
      (await db.collection('staffUserLinkByStaff').doc(`${schoolId}__${uiStaffId}`).get()).data()?.isActive === true
    );
    await ownerUi.page.reload({ waitUntil: 'domcontentloaded' });
    row = ownerUi.page.locator('tr', { hasText: `Staff-${testRunId}` });
    await row.getByText('Lié', { exact: true }).waitFor({ timeout: 30_000 });
    await row.getByRole('button', { name: 'Dissocier' }).click();
    await waitForServerState('Staff account unlink confirmation', async () =>
      (await db.collection('staffUserLinkByStaff').doc(`${schoolId}__${uiStaffId}`).get()).data()?.isActive === false
    );
    await ownerUi.page.reload({ waitUntil: 'domcontentloaded' });
    row = ownerUi.page.locator('tr', { hasText: `Staff-${testRunId}` });
    await row.getByText('Non lié', { exact: true }).waitFor({ timeout: 30_000 });
    assert.equal((await db.collection('staff').doc(uiStaffId).get()).exists, true);
    assert.equal((await db.collection('users').doc(targetUsers['teacher-a'].uid).get()).exists, true);
    assert.equal((await adminAuth.getUser(targetUsers['teacher-a'].uid)).disabled, false);

    console.log('Concurrent links: same Staff to two users');
    const staffA = (await clients.owner.manage({ action: 'CREATE', profile: {
      firstName: 'Concurrency', lastName: 'Staff-A', staffType: 'teacher', employmentStatus: 'active', ...fixture,
    } })).data.staffId;
    const staffB = (await clients.owner.manage({ action: 'CREATE', profile: {
      firstName: 'Concurrency', lastName: 'Staff-B', staffType: 'teacher', employmentStatus: 'active', ...fixture,
    } })).data.staffId;
    const raceOne = await Promise.allSettled([
      clients.owner.link({ staffId: staffA, userId: targetUsers['teacher-b'].uid }),
      clients.owner.link({ staffId: staffA, userId: targetUsers['teacher-c'].uid }),
    ]);
    assert.equal(raceOne.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(raceOne.filter(result => result.status === 'rejected').length, 1);
    const staffAPointer = await db.collection('staffUserLinkByStaff').doc(`${schoolId}__${staffA}`).get();
    assert.equal(staffAPointer.data()?.isActive, true);
    const winningUser = String(staffAPointer.data()?.userId || '');
    await clients.owner.unlink({ staffId: staffA, userId: winningUser, reason: 'E2E concurrency reset' });

    console.log('Concurrent links: two Staff to same user');
    const raceTwo = await Promise.allSettled([
      clients.owner.link({ staffId: staffA, userId: targetUsers['driver-a'].uid }),
      clients.owner.link({ staffId: staffB, userId: targetUsers['driver-a'].uid }),
    ]);
    assert.equal(raceTwo.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(raceTwo.filter(result => result.status === 'rejected').length, 1);
    const userPointer = await db.collection('staffUserLinkByUser').doc(targetUsers['driver-a'].uid).get();
    assert.equal(userPointer.data()?.isActive, true);

    console.log('Cross-school link denied');
    await callableFailure(
      () => clients.owner.link({ staffId: crossStaffId, userId: crossAccount.uid }),
      'permission-denied',
    );

    console.log('Responsive Staff: 360, 768, 1440');
    for (const width of [360, 768, 1440]) {
      await secretaryUi.page.setViewportSize({ width, height: 900 });
      await secretaryUi.page.goto(`${appUrl}/#/staff`, { waitUntil: 'domcontentloaded' });
      await secretaryUi.page.getByLabel('Rechercher').waitFor({ state: 'visible', timeout: 30_000 });
      await secretaryUi.page.getByLabel('Rechercher').fill(testRunId);
      assert.equal(await secretaryUi.page.locator('tr', { hasText: `Staff-${testRunId}` }).isVisible(), true);
      console.log(`RESPONSIVE ${width}: PASS`);
    }
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls });
    console.log('ITALO-W1-04 STAFF LIVE E2E: PASS');
  } finally {
    console.log(`CLEANUP exact testRunId=${testRunId}`);
    for (const app of clientApps) {
      try { if (getAuth(app).currentUser) await signOut(getAuth(app)); await deleteApp(app); } catch { /* continue */ }
    }
    const collections = [
      'audit_logs', 'staffUserLinks', 'staffUserLinkByUser', 'staffUserLinkByStaff',
      'staffAttendance', 'staff', 'users',
    ];
    for (const name of collections) {
      const snapshot = await db.collection(name).where('testRunId', '==', testRunId).get();
      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(document => batch.delete(document.ref));
        await batch.commit();
      }
    }
    for (const uid of fixtureAuthUids) {
      try { await adminAuth.deleteUser(uid); } catch { /* already absent */ }
    }
    const residuals = (await Promise.all(collections.map(name =>
      db.collection(name).where('testRunId', '==', testRunId).get()
    ))).reduce((sum, snapshot) => sum + snapshot.size, 0);
    let authResiduals = 0;
    for (const uid of fixtureAuthUids) {
      try { await adminAuth.getUser(uid); authResiduals += 1; } catch { /* expected */ }
    }
    const activeOrphans = await db.collection('staffUserLinks').where('testRunId', '==', testRunId).where('isActive', '==', true).get();
    console.log(`CLEANUP residuals=${residuals} orphans=${activeOrphans.size} authResiduals=${authResiduals}`);
    assert.equal(residuals, 0);
    assert.equal(activeOrphans.size, 0);
    assert.equal(authResiduals, 0);
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
