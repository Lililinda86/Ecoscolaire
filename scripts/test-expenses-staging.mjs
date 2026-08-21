import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
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
const PREFIX = 'ITALO-STAGING-EXPENSE-TEST-';
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

const requireEnvironment = () => {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing required staging secrets: ${missing.join(', ')}`);
  assertAutomationBypassSecret(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  assert.equal(process.env.STAGING_FIREBASE_PROJECT_ID, EXPECTED_PROJECT,
    'Refusing to run outside ecoscolaire-staging.');
  const url = new URL(process.env.STAGING_APP_URL);
  assert.equal(url.protocol, 'https:', 'Staging URL must use HTTPS.');
  assert.match(url.hostname, /^ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/,
    'Refusing to run against a mutable or non-Ecoscolaire Vercel URL.');
  return url.origin;
};

const expectDenied = async (operation, label) => {
  try {
    await operation();
    assert.fail(`${label}: operation unexpectedly succeeded.`);
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    assert.match(String(error?.code || error?.message || ''),
      /permission-denied|unauthenticated|not-found|already-exists/i,
      `${label}: unexpected failure ${error?.code || error?.message || 'unknown'}`);
  }
};

const waitFor = async (reader, label, timeoutMs = 30_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await reader();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`${label}: timed out.`);
};

const doualaDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const run = async () => {
  const appUrl = requireEnvironment();
  const runToken = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '1').replace(/[^A-Za-z0-9_-]/g, '-');
  const suffix = `${runToken}-${attempt}`;
  const schoolA = `${PREFIX}SCHOOL-A-${suffix}`;
  const schoolB = `${PREFIX}SCHOOL-B-${suffix}`;
  const createdProbeId = `${PREFIX}PROBE-${suffix}`;
  const crossSchoolExpenseId = `${PREFIX}CROSS-SCHOOL-${suffix}`;
  const today = doualaDate();
  const roleFixtures = ['owner', 'secretary', 'boardViewer'].map((role) => {
    const key = role.toLowerCase();
    return {
      role,
      key,
      schoolId: schoolA,
      uid: `${PREFIX}${key}-${suffix}`.slice(0, 128),
      email: `${PREFIX}${key}-${suffix}@example.test`.toLowerCase(),
      password: `T!${crypto.randomBytes(30).toString('base64url')}`,
    };
  });
  const owner = roleFixtures.find((item) => item.role === 'owner');
  const secretary = roleFixtures.find((item) => item.role === 'secretary');
  const board = roleFixtures.find((item) => item.role === 'boardViewer');
  assert.ok(owner && secretary && board);

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT);
  } catch {
    throw new Error('STAGING_FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
  }
  assert.equal(serviceAccount.project_id, EXPECTED_PROJECT,
    'Refusing Admin access outside ecoscolaire-staging.');

  const adminApp = initializeAdminApp({ credential: cert(serviceAccount) }, `expense-e2e-admin-${suffix}`);
  const adminDb = getAdminFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const clientApp = initializeApp({
    apiKey: process.env.STAGING_FIREBASE_API_KEY,
    authDomain: process.env.STAGING_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
    storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.STAGING_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.STAGING_FIREBASE_APP_ID,
  }, `expense-e2e-client-${suffix}`);
  const clientAuth = getAuth(clientApp);
  const clientDb = getFirestore(clientApp);
  const clientFunctions = getFunctions(clientApp, 'us-central1');
  const createExpense = httpsCallable(clientFunctions, 'createExpense');
  const reverseExpense = httpsCallable(clientFunctions, 'reverseExpense');
  const closeCashDrawer = httpsCallable(clientFunctions, 'closeCashDrawer');
  const governanceSummary = httpsCallable(clientFunctions, 'getBoardViewerGovernanceSummary');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  await page.route(`${appUrl}/**`, async (route) => {
    await route.continue({ headers: {
      ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'x-vercel-set-bypass-cookie': 'true',
    } });
  });
  const firebaseRequestUrls = [];
  page.on('request', (request) => {
    if (classifyFirebaseRequest(request.url()).relevant) firebaseRequestUrls.push(request.url());
  });
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  const exactRefs = [];
  const createFixture = async (collectionName, id, data) => {
    const ref = adminDb.collection(collectionName).doc(id);
    assert.equal((await ref.get()).exists, false, `Refusing to overwrite ${ref.path}.`);
    await ref.create({ ...data, testFixture: true, testRunId: suffix });
    exactRefs.push(ref);
    return ref;
  };
  const queryRun = (collectionName) => adminDb.collection(collectionName)
    .where('testRunId', '==', suffix).get();
  const findExpense = async (reason) => {
    const snapshot = await queryRun('expenses');
    return snapshot.docs.find((item) => item.data().reason === reason) || null;
  };
  const loginUi = async (account) => {
    await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email').fill(account.email);
    await page.getByTestId('login-password').fill(account.password);
    await page.getByTestId('login-submit').click();
    if (account.role === 'boardViewer') {
      await page.getByRole('heading', { name: 'Synthèse de gouvernance' })
        .waitFor({ state: 'visible', timeout: 30_000 });
    } else {
      await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 30_000 });
    }
  };
  const logoutUi = async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (await page.getByRole('button', { name: 'Ouvrir le menu principal' }).isVisible()) {
      await page.getByRole('button', { name: 'Ouvrir le menu principal' }).click();
    }
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('logout-button').click();
    await page.getByTestId('login-submit').waitFor({ state: 'visible', timeout: 20_000 });
  };
  const assertResponsive = async (label) => {
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 360 ? 800 : 1000 });
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 4, `${label} ${width}px critical overflow: ${overflow}px.`);
    }
  };
  const createExpenseUi = async (account, amount, reason) => {
    await loginUi(account);
    await page.goto(`${appUrl}/#/payments`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Comptabilité Générale/ })
      .waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: /Dépense \(-\)/ }).click();
    await page.getByText("Enregistrer une Sortie d'Argent").waitFor({ state: 'visible' });
    await page.locator('input[type="number"]:visible').fill(String(amount));
    await page.locator('input[type="date"]:visible').fill(today);
    await page.getByPlaceholder('ex: Achat de craie, Réparation de porte...').fill(reason);
    await page.locator('select:visible').selectOption('OTHER');
    await page.getByPlaceholder("Nom de l'enseignant, du fournisseur...").fill(`${PREFIX}${account.role}`);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Confirmer le retrait' }).click();
    const expense = await waitFor(() => findExpense(reason), `${account.role} UI expense creation`);
    await page.getByRole('button', { name: 'Dépenses / Sorties' }).click();
    await page.getByText(reason, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
    await assertResponsive(account.role);
    return expense;
  };

  const closureId = `${schoolA}__${today}`;
  try {
    console.log('PRECHECK: immutable Vercel Preview and Firebase staging routing');
    const stagingRequest = page.waitForRequest(
      (request) => classifyFirebaseRequest(request.url()).staging,
      { timeout: 30_000 },
    );
    await page.goto(`${appUrl}/#/diagnostic`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: page.url() });
    await page.getByTestId('diagnostic-firebase-project').waitFor({ state: 'visible', timeout: 30_000 });
    const runtimeProject = (await page.getByTestId('diagnostic-firebase-project').textContent())?.trim() || '';
    assertStagingRuntimeProject(runtimeProject);
    await page.evaluate(async (projectId) => {
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}`
        + '/databases/(default)/documents/__e2e_precheck__/expense-network-probe';
      await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit' }).catch(() => undefined);
    }, runtimeProject);
    await stagingRequest;
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequestUrls });

    console.log('FIXTURES: exact isolated school and role accounts');
    await createFixture('schools', schoolA, {
      id: schoolA, name: `${PREFIX}School A ${suffix}`, academicYear: '2026-2027',
      activeAcademicYearId: `${PREFIX}YEAR-${suffix}`, studentsCount: 0,
      status: 'active', isActive: true,
    });
    await createFixture('schools', schoolB, {
      id: schoolB, name: `${PREFIX}School B ${suffix}`, academicYear: '2026-2027',
      activeAcademicYearId: `${PREFIX}YEAR-B-${suffix}`, studentsCount: 0,
      status: 'active', isActive: true,
    });
    for (const account of roleFixtures) {
      await adminAuth.createUser({ uid: account.uid, email: account.email,
        password: account.password, emailVerified: true, disabled: false });
      await createFixture('users', account.uid, {
        id: account.uid, email: account.email, name: `${PREFIX}${account.role}`,
        role: account.role, schoolId: account.schoolId, active: true, isActive: true,
      });
    }
    await createFixture('expenses', crossSchoolExpenseId, {
      id: crossSchoolExpenseId, schoolId: schoolB, amount: 4000, date: today,
      person: `${PREFIX}FOREIGN`, reason: `${PREFIX}CROSS-SCHOOL`, category: 'TEST',
      kind: 'EXPENSE', status: 'POSTED', createdBy: 'fixture-admin',
      createdByRole: 'owner', immutableVersion: 1,
    });

    console.log('OWNER BACKEND CREATE: 5000, category TEST, forged trusted fields ignored');
    const ownerReason = `${PREFIX}OWNER-5000-${suffix}`;
    await signInWithEmailAndPassword(clientAuth, owner.email, owner.password);
    const ownerCreated = (await createExpense({
      amount: 5000, date: today, person: `${PREFIX}OWNER`, reason: ownerReason,
      category: 'TEST', schoolId: schoolB, actorUid: secretary.uid, actorRole: 'superAdmin',
      createdBy: secretary.uid, createdByRole: 'superAdmin', status: 'DRAFT', kind: 'REVERSAL',
    })).data;
    const ownerExpense = await adminDb.collection('expenses').doc(ownerCreated.expenseId).get();
    assert.equal(ownerExpense.data().amount, 5000);
    assert.equal(ownerExpense.data().category, 'TEST');
    assert.equal(ownerExpense.data().schoolId, schoolA);
    assert.equal(ownerExpense.data().createdBy, owner.uid);
    assert.equal(ownerExpense.data().createdByRole, 'owner');
    assert.equal(ownerExpense.data().status, 'POSTED');
    assert.equal(ownerExpense.data().kind, 'EXPENSE');
    assert.equal(ownerExpense.data().createdAt?.constructor?.name, 'Timestamp');
    console.log('OWNER CREATE: PASS');

    console.log('OWNER UI CREATE/HISTORY/RESPONSIVE: 1100');
    const ownerUiReason = `${PREFIX}OWNER-UI-1100-${suffix}`;
    const ownerUiExpense = await createExpenseUi(owner, 1100, ownerUiReason);
    assert.equal(ownerUiExpense.data().createdBy, owner.uid);

    console.log('SECRETARY UI CREATE: 7000');
    await logoutUi();
    const secretaryReason = `${PREFIX}SECRETARY-7000-${suffix}`;
    const secretaryExpense = await createExpenseUi(secretary, 7000, secretaryReason);
    assert.equal(secretaryExpense.data().amount, 7000);
    assert.equal(secretaryExpense.data().schoolId, schoolA);
    assert.equal(secretaryExpense.data().createdBy, secretary.uid);
    assert.equal(secretaryExpense.data().createdByRole, 'secretary');
    assert.equal(await page.locator('tr').filter({ hasText: secretaryReason })
      .locator('button[title="Contre-passer"]').count(), 0);
    console.log('SECRETARY CREATE: PASS');
    await logoutUi();

    const initial = (await queryRun('expenses')).docs
      .filter((item) => item.data().schoolId === schoolA)
      .reduce((sum, item) => sum + item.data().amount, 0);
    assert.equal(initial, 13100, 'Initial signed expense total is wrong.');

    console.log('DIRECT IMMUTABILITY AND TRUSTED IDENTITY');
    const ownerRef = doc(clientDb, 'expenses', ownerExpense.id);
    for (const mutation of [
      { amount: 1 }, { category: 'FORGED' }, { reason: 'FORGED' }, { date: '2026-01-01' },
      { schoolId: schoolB }, { createdBy: secretary.uid },
    ]) {
      await expectDenied(() => updateDoc(ownerRef, mutation), `direct expense update ${Object.keys(mutation)[0]}`);
    }
    await expectDenied(() => deleteDoc(ownerRef), 'direct expense delete');
    await expectDenied(() => setDoc(doc(clientDb, 'expenses', createdProbeId), {
      id: createdProbeId, schoolId: schoolA, amount: 1, status: 'POSTED',
      testFixture: true, testRunId: suffix,
    }), 'direct expense create');
    await expectDenied(() => reverseExpense({ expenseId: crossSchoolExpenseId, reason: 'cross-school' }),
      'cross-school reversal');
    await expectDenied(() => reverseExpense({ expenseId: `${PREFIX}MISSING-${suffix}`, reason: 'foreign id' }),
      'foreign expense id');
    console.log('DIRECT UPDATE: DENY');
    console.log('DIRECT DELETE: DENY');
    console.log('FORGERY PROTECTION: PASS');
    console.log('CROSS-SCHOOL: DENY');

    console.log('SECRETARY AND BOARDVIEWER REVERSAL BOUNDARY');
    await signOut(clientAuth);
    await signInWithEmailAndPassword(clientAuth, secretary.email, secretary.password);
    await expectDenied(() => reverseExpense({ expenseId: secretaryExpense.id, reason: 'forbidden secretary' }),
      'secretary reversal');
    await signOut(clientAuth);
    await signInWithEmailAndPassword(clientAuth, board.email, board.password);
    await expectDenied(() => getDoc(doc(clientDb, 'expenses', ownerExpense.id)), 'BoardViewer raw expense read');
    await expectDenied(() => setDoc(doc(clientDb, 'expenses', createdProbeId), {
      id: createdProbeId, schoolId: schoolA, amount: 1, testFixture: true, testRunId: suffix,
    }), 'BoardViewer expense create');
    await expectDenied(() => updateDoc(doc(clientDb, 'expenses', ownerExpense.id), { amount: 1 }),
      'BoardViewer expense update');
    await expectDenied(() => deleteDoc(doc(clientDb, 'expenses', ownerExpense.id)),
      'BoardViewer expense delete');
    await expectDenied(() => reverseExpense({ expenseId: ownerExpense.id, reason: 'forbidden board' }),
      'BoardViewer reversal');
    await signOut(clientAuth);
    console.log('SECRETARY REVERSAL: DENY');
    console.log('BOARDVIEWER RAW/CREATE/UPDATE/DELETE/REVERSE: DENY');

    console.log('OWNER UI REVERSAL AND DOUBLE REVERSAL');
    await loginUi(owner);
    await page.goto(`${appUrl}/#/payments`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Dépenses / Sorties' }).click();
    const ownerRow = page.locator('tr').filter({ hasText: ownerReason });
    const reversalReason = `${PREFIX}OWNER-REVERSAL-${suffix}`;
    const dialogHandler = async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept(reversalReason);
      else await dialog.accept();
    };
    page.on('dialog', dialogHandler);
    await ownerRow.locator('button[title="Contre-passer"]').click();
    const ownerReversal = await waitFor(async () => {
      const snapshot = await adminDb.collection('expenses').doc(`${ownerExpense.id}__reversal`).get();
      return snapshot.exists ? snapshot : null;
    }, 'owner UI reversal');
    page.off('dialog', dialogHandler);
    assert.equal((await adminDb.collection('expenses').doc(ownerExpense.id).get()).data().amount, 5000);
    assert.equal(ownerReversal.data().amount, -5000);
    assert.equal(ownerReversal.data().originalExpenseId, ownerExpense.id);
    assert.equal(ownerReversal.data().createdBy, owner.uid);
    assert.equal(ownerReversal.data().createdAt?.constructor?.name, 'Timestamp');
    await logoutUi();
    await signInWithEmailAndPassword(clientAuth, owner.email, owner.password);
    await expectDenied(() => reverseExpense({ expenseId: ownerExpense.id, reason: 'second reversal' }),
      'double reversal');
    const uiReversal = (await reverseExpense({ expenseId: ownerUiExpense.id, reason: 'owner UI fixture reversal' })).data;
    assert.equal(uiReversal.reversalAmount, -1100);
    console.log('OWNER REVERSAL: PASS');
    console.log('DOUBLE REVERSAL: DENY');

    console.log('CONCURRENT REVERSAL');
    const concurrent = (await createExpense({
      amount: 9000, date: today, person: `${PREFIX}CONCURRENCY`,
      reason: `${PREFIX}CONCURRENCY-${suffix}`, category: 'TEST',
    })).data;
    const concurrentResults = await Promise.allSettled([
      reverseExpense({ expenseId: concurrent.expenseId, reason: 'concurrent A' }),
      reverseExpense({ expenseId: concurrent.expenseId, reason: 'concurrent B' }),
    ]);
    assert.equal(concurrentResults.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal((await adminDb.collection('expenses')
      .where('originalExpenseId', '==', concurrent.expenseId).get()).size, 1);
    console.log('CONCURRENCY: PASS (success=1, reversal=1)');

    console.log('AUDIT IMMUTABILITY AND TRUSTED FIELDS');
    const audits = await queryRun('audit_logs');
    assert.equal(audits.docs.filter((item) => item.data().action === 'EXPENSE_CREATED').length, 4);
    assert.equal(audits.docs.filter((item) => item.data().action === 'EXPENSE_REVERSED').length, 3);
    for (const audit of audits.docs) {
      const data = audit.data();
      assert.equal(data.canonicalBackendAudit, true);
      assert.equal(data.schoolId, schoolA);
      assert.ok([owner.uid, secretary.uid].includes(data.actorUid));
      assert.ok(['owner', 'secretary'].includes(data.actorRole));
      assert.equal(data.createdAt?.constructor?.name, 'Timestamp');
    }
    const auditRef = doc(clientDb, 'audit_logs', audits.docs[0].id);
    await expectDenied(() => setDoc(doc(clientDb, 'audit_logs', createdProbeId), {
      action: 'FORGED', testFixture: true, testRunId: suffix,
    }),
      'direct audit create');
    await expectDenied(() => updateDoc(auditRef, { action: 'FORGED' }), 'direct audit update');
    await expectDenied(() => deleteDoc(auditRef), 'direct audit delete');
    console.log('AUDIT: PASS');

    console.log('SIGNED DASHBOARD AND CASH CLOSURE');
    const signedRows = (await queryRun('expenses')).docs.filter((item) => item.data().schoolId === schoolA);
    const signedTotal = signedRows.reduce((sum, item) => sum + item.data().amount, 0);
    assert.equal(signedTotal, 7000, 'Signed expense ledger did not net reversals exactly once.');
    await signOut(clientAuth);
    await signInWithEmailAndPassword(clientAuth, secretary.email, secretary.password);
    const closureResult = (await closeCashDrawer({
      schoolId: schoolA, academicYear: '2026-2027', date: today,
      openingBalance: 10000, countedBalance: 3000, notes: '',
    })).data;
    assert.equal(closureResult.closureId, closureId);
    const closure = await adminDb.collection('cashClosures').doc(closureId).get();
    assert.equal(closure.data().cashExpenses, 7000);
    assert.equal(closure.data().theoreticalBalance, 3000);
    assert.equal(closure.data().discrepancy, 0);
    await signOut(clientAuth);
    await signInWithEmailAndPassword(clientAuth, board.email, board.password);
    const summary = (await governanceSummary({ schoolId: schoolB })).data;
    assert.equal(summary.school.id, schoolA);
    assert.equal(summary.finance.expenses, 7000);
    assert.equal(JSON.stringify(summary).includes(ownerReason), false);
    assert.equal(JSON.stringify(summary).includes(secretaryReason), false);
    await signOut(clientAuth);
    console.log('DASHBOARD: PASS');
    console.log('CASH JOURNAL/CLOSURE: PASS');

    console.log('BOARDVIEWER UI LOGIN/DASHBOARD/LOGOUT');
    await loginUi(board);
    await page.getByText('Accès en consultation uniquement').waitFor({ state: 'visible' });
    await page.getByText('Aucun dossier individuel n’est exposé.').waitFor({ state: 'visible' });
    await assertResponsive('boardViewer');
    const boardBody = await page.locator('body').innerText();
    assert.equal(boardBody.includes(ownerReason), false);
    assert.equal(boardBody.includes(secretaryReason), false);
    await logoutUi();
    console.log('BOARDVIEWER: PASS');

    const financialSources = [
      fs.readFileSync(new URL('../src/pages/Payments.tsx', import.meta.url), 'utf8'),
      fs.readFileSync(new URL('../src/services/expenses.ts', import.meta.url), 'utf8'),
    ].join('\n');
    assert.equal(/\b(?:0000|778899)\b/.test(financialSources), false,
      'A legacy universal financial PIN remains in the active expense workflow.');
    console.log('LEGACY FINANCIAL PIN DEPENDENCY: NONE');
    assert.deepEqual(browserErrors, [], `Unexpected browser runtime errors: ${browserErrors.join(' | ')}`);
    assertStagingFirebasePrecheck({ runtimeProject, requestUrls: firebaseRequestUrls });
    console.log('EXPENSES STAGING E2E: PASS');
  } finally {
    console.log('CLEANUP: exact fixture IDs only');
    try {
      if (clientAuth.currentUser) await signOut(clientAuth).catch(() => undefined);
      for (const collectionName of ['audit_logs', 'expenses']) {
        const snapshots = await queryRun(collectionName);
        for (const snapshot of snapshots.docs) {
          const data = snapshot.data();
          assert.equal(data.testFixture, true, `Refusing to delete non-fixture ${snapshot.ref.path}.`);
          assert.equal(data.testRunId, suffix, `Refusing to delete foreign fixture ${snapshot.ref.path}.`);
          await snapshot.ref.delete();
        }
      }
      const closureRef = adminDb.collection('cashClosures').doc(closureId);
      const closure = await closureRef.get();
      if (closure.exists) {
        assert.equal(closure.data().schoolId, schoolA, `Refusing to delete foreign ${closureRef.path}.`);
        assert.equal(closure.data().closedBy, secretary.uid, `Unexpected closure actor ${closureRef.path}.`);
        await closureRef.delete();
      }
      for (const ref of [...exactRefs].reverse()) {
        const snapshot = await ref.get();
        if (!snapshot.exists) continue;
        assert.equal(snapshot.data().testFixture, true, `Refusing to delete non-fixture ${ref.path}.`);
        assert.equal(snapshot.data().testRunId, suffix, `Refusing to delete foreign fixture ${ref.path}.`);
        await ref.delete();
      }
      for (const account of roleFixtures) {
        const user = await adminAuth.getUser(account.uid)
          .catch((error) => error?.code === 'auth/user-not-found' ? null : Promise.reject(error));
        if (!user) continue;
        assert.equal(user.email, account.email, `Refusing to delete unexpected Auth user ${account.uid}.`);
        await adminAuth.deleteUser(account.uid);
      }

      assert.equal((await queryRun('expenses')).empty, true, 'Residual test expenses/reversals found.');
      assert.equal((await queryRun('audit_logs')).empty, true, 'Residual test audits found.');
      assert.equal((await adminDb.collection('cashClosures').doc(closureId).get()).exists, false);
      for (const ref of exactRefs) assert.equal((await ref.get()).exists, false, `Residual ${ref.path}.`);
      for (const account of roleFixtures) {
        const exists = await adminAuth.getUser(account.uid).then(() => true)
          .catch((error) => error?.code === 'auth/user-not-found' ? false : Promise.reject(error));
        assert.equal(exists, false, `Residual Auth user ${account.uid}.`);
      }
      console.log('TEST EXPENSES: 0');
      console.log('TEST REVERSALS: 0');
      console.log('TEST USERS: 0');
      console.log('TEST AUTH: 0');
      console.log('CLEANUP: PASS');
      console.log('ORPHANS: 0');
    } finally {
      await context.close();
      await browser.close();
      await deleteApp(clientApp);
      await deleteAdminApp(adminApp);
    }
  }
};

run().catch((error) => {
  const secrets = REQUIRED_ENV.map((name) => process.env[name])
    .filter((value) => typeof value === 'string' && value.length >= 4);
  let message = String(error?.stack || error?.message || error);
  for (const secret of secrets) message = message.split(secret).join('[REDACTED]');
  console.error(message);
  process.exitCode = 1;
});
