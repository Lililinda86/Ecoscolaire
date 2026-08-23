import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { applicationDefault, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { chromium } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, getFirestore as getClientFirestore, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT = 'ecoscolaire-c5861';
const SCHOOL = 'italo-gsb';
const APP_URL = 'https://ecoscolaire.vercel.app';
const MARKER_PREFIX = 'ITALO-PROD-STAFF-TEST-';
const REQUIRED_ENV = [
  'PRODUCTION_APP_URL', 'PRODUCTION_FIREBASE_PROJECT_ID', 'PRODUCTION_SCHOOL_ID',
  'PRODUCTION_FIREBASE_API_KEY', 'PRODUCTION_FIREBASE_AUTH_DOMAIN',
  'PRODUCTION_FIREBASE_STORAGE_BUCKET', 'PRODUCTION_FIREBASE_MESSAGING_SENDER_ID',
  'PRODUCTION_FIREBASE_APP_ID', 'PRODUCTION_EXPECTED_SHA', 'TEST_MARKER_PREFIX',
];
const MARKED_COLLECTIONS = [
  'audit_logs', 'staffUserLinks', 'staffUserLinkByUser', 'staffUserLinkByStaff',
  'staffAttendance', 'staff', 'users',
];
const INVENTORY_COLLECTIONS = ['staff', 'users', 'students', 'classes', 'attendance', 'payments'];

const requireEnvironment = () => {
  const missing = REQUIRED_ENV.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing Production configuration: ${missing.join(', ')}`);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  assert.equal(process.env.PRODUCTION_APP_URL, APP_URL);
  assert.equal(process.env.PRODUCTION_FIREBASE_PROJECT_ID, PROJECT);
  assert.notEqual(process.env.PRODUCTION_FIREBASE_PROJECT_ID, 'ecoscolaire-staging');
  assert.equal(process.env.PRODUCTION_SCHOOL_ID, SCHOOL);
  assert.equal(process.env.TEST_MARKER_PREFIX, MARKER_PREFIX);
  assert.match(process.env.PRODUCTION_EXPECTED_SHA, /^[a-f0-9]{40}$/);
};

const firebaseConfig = () => ({
  apiKey: process.env.PRODUCTION_FIREBASE_API_KEY,
  authDomain: process.env.PRODUCTION_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.PRODUCTION_FIREBASE_PROJECT_ID,
  storageBucket: process.env.PRODUCTION_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.PRODUCTION_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.PRODUCTION_FIREBASE_APP_ID,
});

const expectFailure = async (operation, codes) => {
  try {
    await operation();
    assert.fail(`Expected failure: ${codes.join(' or ')}`);
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    const businessCode = error?.details?.businessCode;
    assert.ok(codes.includes(error?.code) || codes.includes(businessCode),
      `Unexpected failure ${error?.code || 'unknown'} / ${businessCode || 'none'}`);
  }
};

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

const countInventory = async db => {
  const result = {};
  for (const name of INVENTORY_COLLECTIONS) {
    result[name] = (await db.collection(name).count().get()).data().count;
  }
  return result;
};

const markedSnapshots = async (db, testRunId) => Promise.all(MARKED_COLLECTIONS.map(name =>
  db.collection(name).where('testRunId', '==', testRunId).get()
));

const configurePage = async (browser, testRunId) => {
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
  return { context, page };
};

const loginStaff = async (page, email, password) => {
  await page.goto(`${APP_URL}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 30_000 });
  await page.goto(`${APP_URL}/#/staff`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Personnel|Staff/i }).waitFor({ timeout: 30_000 });
};

const run = async () => {
  requireEnvironment();
  const token = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const testRunId = `${MARKER_PREFIX}${token}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  const fixture = { testFixture: true, testRunId };
  const password = `T!${randomBytes(24).toString('base64url')}9a`;
  const adminApp = initializeAdminApp({ credential: applicationDefault(), projectId: PROJECT }, `prod-staff-${token}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const authUids = [];
  const clientApps = [];
  const pages = [];
  let preInventory;
  let firestoreCreated = 0;
  let testError;

  const createAccount = async (label, role, schoolId = SCHOOL) => {
    const email = `${testRunId.toLowerCase()}-${label}@example.invalid`;
    const account = await adminAuth.createUser({ email, password, emailVerified: true, disabled: false });
    authUids.push(account.uid);
    await db.collection('users').doc(account.uid).create({
      id: account.uid, email, role, schoolId, active: true, isActive: true,
      createdAt: FieldValue.serverTimestamp(), createdBy: 'ITALO_PRODUCTION_STAFF_SMOKE', ...fixture,
    });
    return { uid: account.uid, email, role, schoolId };
  };

  const createClient = async (label, account) => {
    const app = initializeApp(firebaseConfig(), `prod-staff-${label}-${token}`);
    clientApps.push(app);
    const auth = getAuth(app);
    await signInWithEmailAndPassword(auth, account.email, password);
    const functions = getFunctions(app, 'us-central1');
    return {
      auth,
      db: getClientFirestore(app),
      manage: httpsCallable(functions, 'manageStaff'),
      link: httpsCallable(functions, 'linkStaffToUser'),
      unlink: httpsCallable(functions, 'unlinkStaffFromUser'),
    };
  };

  try {
    assert.equal(adminApp.options.projectId, PROJECT);
    assert.equal((await db.collection('schools').doc(SCHOOL).get()).exists, true, 'ITALO school is missing.');
    preInventory = await countInventory(db);
    console.log(`PRE-INVENTORY ${JSON.stringify(preInventory)}`);

    const owner = await createAccount('owner', 'owner');
    const secretary = await createAccount('secretary', 'secretary');
    const targetA = await createAccount('target-a', 'teacher');
    const targetB = await createAccount('target-b', 'driver');
    const privacyAccounts = {};
    for (const role of ['teacher', 'driver', 'parent', 'student', 'boardViewer']) {
      privacyAccounts[role] = await createAccount(`privacy-${role.toLowerCase()}`, role);
    }
    const crossUser = await createAccount('cross-user', 'teacher', `${SCHOOL}-cross-fixture`);

    const ownerClient = await createClient('owner', owner);
    const secretaryClient = await createClient('secretary', secretary);
    const privacyClients = {};
    for (const [role, account] of Object.entries(privacyAccounts)) {
      privacyClients[role] = await createClient(`privacy-${role}`, account);
    }

    const crossStaffId = `cross-${token}`;
    await db.collection('staff').doc(crossStaffId).create({
      id: crossStaffId, schoolId: `${SCHOOL}-cross-fixture`, firstName: 'Fixture', lastName: testRunId,
      staffType: 'teacher', employmentStatus: 'active', isActive: true,
      createdAt: FieldValue.serverTimestamp(), ...fixture,
    });

    console.log('PRODUCTION UI lifecycle: create, reload, edit, deactivate, reactivate');
    const secretaryUi = await configurePage(browser, testRunId);
    pages.push(secretaryUi);
    await secretaryUi.page.goto(`${APP_URL}/#/diagnostic`, { waitUntil: 'domcontentloaded' });
    await secretaryUi.page.getByTestId('diagnostic-firebase-project').waitFor({ timeout: 30_000 });
    assert.equal((await secretaryUi.page.getByTestId('diagnostic-firebase-project').textContent())?.trim(), PROJECT);
    await loginStaff(secretaryUi.page, secretary.email, password);
    await secretaryUi.page.getByRole('button', { name: /Ajouter|add/i }).click();
    await secretaryUi.page.getByLabel('Nom', { exact: true }).fill(testRunId);
    await secretaryUi.page.getByLabel('Prénom', { exact: true }).fill('Fixture');
    await secretaryUi.page.getByRole('button', { name: /Enregistrer|Sauvegarder|save/i }).click();
    await secretaryUi.page.getByLabel('Nom', { exact: true }).waitFor({ state: 'hidden', timeout: 30_000 });
    let staffRows = await db.collection('staff').where('testRunId', '==', testRunId)
      .where('schoolId', '==', SCHOOL).get();
    assert.equal(staffRows.size, 1);
    const staffA = staffRows.docs[0].id;
    await secretaryUi.page.reload({ waitUntil: 'domcontentloaded' });
    let row = secretaryUi.page.locator('tr', { hasText: testRunId });
    await row.waitFor({ timeout: 30_000 });
    await row.getByTestId(`edit-btn-${staffA}`).click();
    await secretaryUi.page.getByLabel('Prénom', { exact: true }).fill('Fixture-Modifiée');
    await secretaryUi.page.getByRole('button', { name: /Enregistrer|Sauvegarder|save/i }).click();
    await waitForServerState('Production Staff update', async () =>
      (await db.collection('staff').doc(staffA).get()).data()?.firstName === 'Fixture-Modifiée');
    await secretaryUi.page.reload({ waitUntil: 'domcontentloaded' });
    row = secretaryUi.page.locator('tr', { hasText: testRunId });
    await row.getByTestId(`deact-btn-${staffA}`).click();
    await waitForServerState('Production Staff deactivation', async () =>
      (await db.collection('staff').doc(staffA).get()).data()?.isActive === false);
    await secretaryUi.page.reload({ waitUntil: 'domcontentloaded' });
    row = secretaryUi.page.locator('tr', { hasText: testRunId });
    await row.getByTestId(`reactivate-btn-${staffA}`).click();
    await waitForServerState('Production Staff reactivation', async () =>
      (await db.collection('staff').doc(staffA).get()).data()?.isActive === true);
    await secretaryUi.page.reload({ waitUntil: 'domcontentloaded' });

    console.log('PRODUCTION secretary least privilege');
    await expectFailure(() => secretaryClient.manage({
      action: 'UPDATE', staffId: staffA, profile: { role: 'owner', ...fixture },
    }), ['functions/invalid-argument', 'UNSUPPORTED_STAFF_FIELDS']);
    await expectFailure(() => secretaryClient.manage({
      action: 'UPDATE', staffId: staffA, profile: { salary: 1, ...fixture },
    }), ['functions/invalid-argument', 'UNSUPPORTED_STAFF_FIELDS']);
    await expectFailure(() => secretaryClient.link({ staffId: staffA, userId: targetA.uid }),
      ['functions/permission-denied', 'PERMISSION_DENIED']);
    await expectFailure(() => secretaryClient.unlink({ staffId: staffA, userId: targetA.uid }),
      ['functions/permission-denied', 'PERMISSION_DENIED']);

    console.log('PRODUCTION UI account link/unlink');
    const ownerUi = await configurePage(browser, testRunId);
    pages.push(ownerUi);
    await loginStaff(ownerUi.page, owner.email, password);
    row = ownerUi.page.locator('tr', { hasText: testRunId });
    await row.getByRole('button', { name: 'Lier un compte' }).click();
    await ownerUi.page.getByLabel('Compte actif de la même école').selectOption(targetA.uid);
    await ownerUi.page.getByRole('button', { name: 'Confirmer la liaison' }).click();
    await waitForServerState('Production Staff link', async () =>
      (await db.collection('staffUserLinkByStaff').doc(`${SCHOOL}__${staffA}`).get()).data()?.isActive === true);
    await ownerUi.page.reload({ waitUntil: 'domcontentloaded' });
    row = ownerUi.page.locator('tr', { hasText: testRunId });
    await row.getByText('Lié', { exact: true }).waitFor({ timeout: 30_000 });
    await row.getByRole('button', { name: 'Dissocier' }).click();
    await waitForServerState('Production Staff unlink', async () =>
      (await db.collection('staffUserLinkByStaff').doc(`${SCHOOL}__${staffA}`).get()).data()?.isActive === false);
    assert.equal((await db.collection('staff').doc(staffA).get()).exists, true);
    assert.equal((await db.collection('users').doc(targetA.uid).get()).exists, true);
    assert.equal((await adminAuth.getUser(targetA.uid)).disabled, false);

    const staffB = (await ownerClient.manage({ action: 'CREATE', profile: {
      firstName: 'Concurrency', lastName: testRunId, staffType: 'teacher', ...fixture,
    } })).data.staffId;
    const staffC = (await ownerClient.manage({ action: 'CREATE', profile: {
      firstName: 'Concurrency-2', lastName: testRunId, staffType: 'teacher', ...fixture,
    } })).data.staffId;

    console.log('PRODUCTION concurrency same Staff to two users');
    const raceOne = await Promise.allSettled([
      ownerClient.link({ staffId: staffB, userId: targetA.uid }),
      ownerClient.link({ staffId: staffB, userId: targetB.uid }),
    ]);
    assert.equal(raceOne.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(raceOne.filter(item => item.status === 'rejected').length, 1);
    const staffPointer = await db.collection('staffUserLinkByStaff').doc(`${SCHOOL}__${staffB}`).get();
    const winningUser = String(staffPointer.data()?.userId || '');
    assert.equal(staffPointer.data()?.isActive, true);
    await ownerClient.unlink({ staffId: staffB, userId: winningUser, reason: 'Production smoke reset' });

    console.log('PRODUCTION concurrency two Staff to same user');
    const raceTwo = await Promise.allSettled([
      ownerClient.link({ staffId: staffB, userId: targetA.uid }),
      ownerClient.link({ staffId: staffC, userId: targetA.uid }),
    ]);
    assert.equal(raceTwo.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(raceTwo.filter(item => item.status === 'rejected').length, 1);
    assert.equal((await db.collection('staffUserLinkByUser').doc(targetA.uid).get()).data()?.isActive, true);

    console.log('PRODUCTION cross-school denial');
    await expectFailure(() => ownerClient.manage({
      action: 'CREATE', schoolId: `${SCHOOL}-cross-fixture`,
      profile: { firstName: 'Cross', lastName: testRunId, ...fixture },
    }), ['functions/permission-denied', 'SCHOOL_MISMATCH']);
    await expectFailure(() => ownerClient.link({ staffId: crossStaffId, userId: crossUser.uid }),
      ['functions/permission-denied', 'SCHOOL_MISMATCH']);
    await expectFailure(() => ownerClient.link({ staffId: staffA, userId: crossUser.uid }),
      ['functions/permission-denied', 'SCHOOL_MISMATCH']);

    console.log('PRODUCTION privacy and physical delete');
    for (const [role, client] of Object.entries(privacyClients)) {
      await expectFailure(() => getDocs(query(collection(client.db, 'staff'), where('schoolId', '==', SCHOOL))),
        ['permission-denied']);
      console.log(`PRIVACY ${role}: PASS`);
    }
    await expectFailure(() => deleteDoc(doc(ownerClient.db, 'staff', staffA)), ['permission-denied']);

    const auditSnapshot = await db.collection('audit_logs').where('testRunId', '==', testRunId).get();
    const requiredStaffAuditActions = [
      'STAFF_CREATED', 'STAFF_UPDATED', 'STAFF_DEACTIVATED', 'STAFF_REACTIVATED',
      'STAFF_USER_LINKED', 'STAFF_USER_UNLINKED',
    ];
    const staffAuditDocuments = auditSnapshot.docs
      .map(item => item.data())
      .filter(item => requiredStaffAuditActions.includes(String(item.action)));
    const auditActions = new Set(staffAuditDocuments.map(item => item.action));
    for (const action of requiredStaffAuditActions) {
      assert.equal(auditActions.has(action), true, `Missing ${action}`);
    }
    const auditJson = JSON.stringify(staffAuditDocuments);
    for (const account of [owner, secretary, targetA, targetB, ...Object.values(privacyAccounts), crossUser]) {
      assert.equal(auditJson.includes(account.email), false, `Staff audit leaked fixture email for role ${account.role}`);
    }
    assert.equal(auditJson.includes('Fixture-Modifiée'), false, 'Staff audit leaked fixture display name');

    console.log('PRODUCTION responsive Staff 360/768/1440');
    for (const width of [360, 768, 1440]) {
      await secretaryUi.page.setViewportSize({ width, height: 900 });
      await secretaryUi.page.goto(`${APP_URL}/#/staff`, { waitUntil: 'domcontentloaded' });
      await secretaryUi.page.getByLabel('Rechercher').waitFor({ timeout: 30_000 });
      await secretaryUi.page.getByLabel('Rechercher').fill(testRunId);
      assert.equal(await secretaryUi.page.locator('tr', { hasText: testRunId }).first().isVisible(), true);
      console.log(`RESPONSIVE ${width}: PASS`);
    }

    const snapshots = await markedSnapshots(db, testRunId);
    firestoreCreated = snapshots.reduce((sum, snapshot) => sum + snapshot.size, 0);
    console.log('ITALO-W1-04 STAFF PRODUCTION SMOKE: PASS');
  } catch (error) {
    testError = error;
    console.error(`FIRST REAL ERROR: ${error?.message || error}`);
  } finally {
    console.log(`CLEANUP exact testRunId=${testRunId}`);
    let cleanupError;
    try {
      for (const item of pages) await item.context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      for (const app of clientApps) {
        try {
          if (getAuth(app).currentUser) await signOut(getAuth(app));
          await deleteApp(app);
        } catch { /* continue exact cleanup */ }
      }
      const snapshots = await markedSnapshots(db, testRunId);
      const markedDocs = snapshots.flatMap(snapshot => snapshot.docs);
      for (const document of markedDocs) {
        assert.equal(document.data().testFixture, true);
        assert.equal(document.data().testRunId, testRunId);
      }
      while (markedDocs.length) {
        const batch = db.batch();
        markedDocs.splice(0, 400).forEach(document => batch.delete(document.ref));
        await batch.commit();
      }
      for (const uid of authUids) {
        try { await adminAuth.deleteUser(uid); } catch (error) {
          if (error?.code !== 'auth/user-not-found') throw error;
        }
      }

      const residualSnapshots = await markedSnapshots(db, testRunId);
      const residuals = residualSnapshots.reduce((sum, snapshot) => sum + snapshot.size, 0);
      const activeOrphans = await db.collection('staffUserLinks')
        .where('testRunId', '==', testRunId).where('isActive', '==', true).get();
      let authResiduals = 0;
      for (const uid of authUids) {
        try { await adminAuth.getUser(uid); authResiduals += 1; } catch { /* expected */ }
      }
      const postInventory = await countInventory(db);
      assert.deepEqual(postInventory, preInventory);
      assert.equal(residuals, 0);
      assert.equal(activeOrphans.size, 0);
      assert.equal(authResiduals, 0);
      console.log(`POST-INVENTORY ${JSON.stringify(postInventory)}`);
      console.log(`CLEANUP Firestore fixtures created=${firestoreCreated} removed=${firestoreCreated}`);
      console.log(`CLEANUP Auth fixtures created=${authUids.length} removed=${authUids.length}`);
      console.log('CLEANUP residuals=0 orphans=0 authResiduals=0');
      console.log('REAL staff/users/Auth/students/classes modified=0');
    } catch (error) {
      cleanupError = error;
      console.error(`CLEANUP FAILURE: ${error?.message || error}`);
    } finally {
      await deleteAdminApp(adminApp).catch(() => undefined);
    }
    if (cleanupError) throw cleanupError;
  }
  if (testError) throw testError;
};

run().catch(error => {
  console.error(`ITALO-W1-04 STAFF PRODUCTION SMOKE: FAIL (${error?.code || 'UNKNOWN'}) ${error?.message || error}`);
  process.exitCode = 1;
});
