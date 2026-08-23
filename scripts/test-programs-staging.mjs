import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { chromium } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase/app';
import { deleteDoc, doc, getDoc, getFirestore as getClientFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { assertAutomationBypassSecret, assertProtectedPreviewLoaded } from './staging-firebase-precheck.mjs';

const PROJECT = 'ecoscolaire-staging';
const REQUIRED = [
  'STAGING_APP_URL', 'STAGING_FIREBASE_SERVICE_ACCOUNT', 'STAGING_FIREBASE_API_KEY',
  'STAGING_FIREBASE_AUTH_DOMAIN', 'STAGING_FIREBASE_PROJECT_ID', 'STAGING_FIREBASE_STORAGE_BUCKET',
  'STAGING_FIREBASE_MESSAGING_SENDER_ID', 'STAGING_FIREBASE_APP_ID', 'VERCEL_AUTOMATION_BYPASS_SECRET',
];
const config = () => ({
  apiKey: process.env.STAGING_FIREBASE_API_KEY,
  authDomain: process.env.STAGING_FIREBASE_AUTH_DOMAIN,
  projectId: PROJECT,
  storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.STAGING_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.STAGING_FIREBASE_APP_ID,
});
const callableFailure = (promise, code) => assert.rejects(promise, error => error?.code === `functions/${code}`);
const canonicalToken = subjects => {
  const normalized = [...subjects].sort((a, b) => a.id.localeCompare(b.id)).map(subject => {
    const value = {
      id: subject.id,
      subjectId: subject.subjectId,
      subjectNameSnapshot: subject.subjectNameSnapshot,
    };
    if (subject.subjectCodeSnapshot !== undefined && subject.subjectCodeSnapshot !== null) value.subjectCodeSnapshot = subject.subjectCodeSnapshot;
    if (subject.coefficient !== undefined && subject.coefficient !== null) value.coefficient = Number(subject.coefficient);
    if (subject.weeklyHours !== undefined && subject.weeklyHours !== null) value.weeklyHours = Number(subject.weeklyHours);
    value.isRequired = !!subject.isRequired;
    value.displayOrder = Number(subject.displayOrder);
    value.isActive = !!subject.isActive;
    value.revisionId = subject.revisionId;
    value.revisionNumber = Number(subject.revisionNumber);
    return value;
  });
  return createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex');
};

async function run() {
  const missing = REQUIRED.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing staging secrets: ${missing.join(', ')}`);
  assert.equal(process.env.STAGING_FIREBASE_PROJECT_ID, PROJECT);
  assertAutomationBypassSecret(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  const appUrl = new URL(process.env.STAGING_APP_URL).origin;
  const token = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const testRunId = `italo-w2-02-${token}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  const fixture = { testFixture: true, testRunId };
  const password = `T!${randomBytes(18).toString('base64url')}9a`;
  const schoolId = `program-school-${testRunId}`;
  const otherSchoolId = `program-cross-${testRunId}`;
  const yearId = `program-year-${testRunId}`;
  const classId = `program-class-${testRunId}`;
  const secondClassId = `program-class-2-${testRunId}`;
  const subjectA = `program-subject-a-${testRunId}`;
  const subjectB = `program-subject-b-${testRunId}`;
  const inactiveSubject = `program-subject-off-${testRunId}`;
  const roles = ['owner', 'director', 'secretary', 'teacher', 'parent', 'student', 'boardViewer'];
  let credentials;
  try { credentials = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT); } catch { throw new Error('Invalid staging service account JSON.'); }
  assert.equal(credentials.project_id, PROJECT);
  const adminApp = initializeAdminApp({ credential: cert(credentials) }, `program-admin-${testRunId}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const authUids = [];
  const clientApps = [];
  const contexts = [];

  const newPage = async (role, viewport) => {
    const context = await browser.newContext({ viewport });
    contexts.push(context);
    const page = await context.newPage();
    await page.route(`${appUrl}/**`, route => route.continue({ headers: {
      ...route.request().headers(),
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'x-vercel-set-bypass-cookie': 'true',
    } }));
    await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
    assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: page.url() });
    await page.getByTestId('login-email').fill(`${role}.${testRunId}@example.test`);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(url => !url.hash.includes('/login'), { timeout: 30_000 });
    return page;
  };

  const revisionSubjects = async (programId, revisionId) => {
    const snapshot = await db.collection('classSubjects').where('programId', '==', programId).where('revisionId', '==', revisionId).get();
    return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
  };

  try {
    await Promise.all([
      db.collection('schools').doc(schoolId).create({
        id: schoolId, name: `ITALO Programs ${testRunId}`, status: 'active', active: true,
        activeAcademicYearId: yearId, academicYear: '2030-2031', version: 1,
        createdAt: FieldValue.serverTimestamp(), ...fixture,
      }),
      db.collection('schools').doc(otherSchoolId).create({
        id: otherSchoolId, name: `ITALO Programs Cross ${testRunId}`, status: 'active', active: true,
        academicYear: '2030-2031', createdAt: FieldValue.serverTimestamp(), ...fixture,
      }),
      db.collection('academicYears').doc(yearId).create({
        id: yearId, schoolId, name: '2030-2031', startDate: '2030-09-01', endDate: '2031-06-30',
        status: 'active', active: true, version: 1, createdBy: 'fixture', updatedBy: 'fixture',
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), ...fixture,
      }),
      db.collection('classes').doc(classId).create({
        id: classId, schoolId, name: `CM1 ${testRunId}`, section: 'francophone', cycle: 'primaire',
        status: 'active', isActive: true, createdAt: FieldValue.serverTimestamp(), ...fixture,
      }),
      db.collection('classes').doc(secondClassId).create({
        id: secondClassId, schoolId, name: `CM2 ${testRunId}`, section: 'francophone', cycle: 'primaire',
        status: 'active', isActive: true, createdAt: FieldValue.serverTimestamp(), ...fixture,
      }),
      db.collection('subjects').doc(subjectA).create({
        id: subjectA, schoolId, name: `Mathématiques ${testRunId}`, code: 'MATH', section: 'francophone',
        cycles: ['primaire'], status: 'active', isActive: true, createdAt: FieldValue.serverTimestamp(), ...fixture,
      }),
      db.collection('subjects').doc(subjectB).create({
        id: subjectB, schoolId, name: `Français ${testRunId}`, code: 'FRA', section: 'francophone',
        cycles: ['primaire'], status: 'active', isActive: true, createdAt: FieldValue.serverTimestamp(), ...fixture,
      }),
      db.collection('subjects').doc(inactiveSubject).create({
        id: inactiveSubject, schoolId, name: `Inactive ${testRunId}`, section: 'francophone',
        cycles: ['primaire'], status: 'inactive', isActive: false, createdAt: FieldValue.serverTimestamp(), ...fixture,
      }),
    ]);

    for (const role of roles) {
      const email = `${role}.${testRunId}@example.test`;
      const account = await adminAuth.createUser({ email, password, emailVerified: true });
      authUids.push(account.uid);
      await db.collection('users').doc(account.uid).create({
        id: account.uid, email, role, schoolId, active: true, isActive: true,
        createdAt: FieldValue.serverTimestamp(), ...fixture,
      });
    }

    const clients = {};
    for (const role of roles) {
      const app = initializeApp(config(), `program-${role}-${testRunId}`);
      clientApps.push(app);
      await signInWithEmailAndPassword(getAuth(app), `${role}.${testRunId}@example.test`, password);
      const functions = getFunctions(app, 'us-central1');
      clients[role] = {
        ensure: httpsCallable(functions, 'ensureClassProgramDraft'),
        update: httpsCallable(functions, 'updateClassProgramDraft'),
        publish: httpsCallable(functions, 'publishClassProgramDraft'),
        archive: httpsCallable(functions, 'archiveClassProgram'),
        firestore: getClientFirestore(app),
      };
    }

    const base = { schoolId, academicYearId: yearId, classId };
    await callableFailure(clients.secretary.ensure(base), 'permission-denied');
    await callableFailure(clients.teacher.ensure(base), 'permission-denied');
    await callableFailure(clients.owner.ensure({ ...base, schoolId: otherSchoolId }), 'permission-denied');
    await callableFailure(clients.owner.ensure({ ...base, classId: 'missing-fixture-class' }), 'not-found');

    const created = (await clients.owner.ensure(base)).data;
    const programId = created.programId;
    const revisionV1 = created.draftRevisionId;
    await clients.owner.update({ ...base, expectedDraftRevisionId: revisionV1, subjects: [] });
    await callableFailure(clients.owner.publish({ ...base, expectedDraftRevisionId: revisionV1, expectedDraftStateToken: canonicalToken([]) }), 'failed-precondition');
    const validSubjects = [
      { subjectId: subjectA, coefficient: 4, weeklyHours: 6, isRequired: true, isActive: true, displayOrder: 0 },
      { subjectId: subjectB, coefficient: 3, weeklyHours: 5, isRequired: true, isActive: true, displayOrder: 1 },
    ];
    await callableFailure(clients.owner.update({ ...base, expectedDraftRevisionId: revisionV1, subjects: [validSubjects[0], validSubjects[0]] }), 'already-exists');
    await callableFailure(clients.owner.update({ ...base, expectedDraftRevisionId: revisionV1, subjects: [{ ...validSubjects[0], coefficient: 0 }] }), 'invalid-argument');
    await callableFailure(clients.owner.update({ ...base, expectedDraftRevisionId: revisionV1, subjects: [{ ...validSubjects[0], subjectId: inactiveSubject }] }), 'failed-precondition');
    await clients.owner.update({ ...base, expectedDraftRevisionId: revisionV1, subjects: validSubjects });
    const v1Documents = await revisionSubjects(programId, revisionV1);
    assert.equal(v1Documents.length, 2);
    const publication = { ...base, expectedDraftRevisionId: revisionV1, expectedDraftStateToken: canonicalToken(v1Documents) };
    const concurrent = await Promise.allSettled([clients.owner.publish(publication), clients.owner.publish(publication)]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter(result => result.status === 'rejected' && result.reason?.code === 'functions/already-exists').length, 1);
    await assert.rejects(updateDoc(doc(clients.owner.firestore, 'classPrograms', programId), { status: 'draft' }));
    await assert.rejects(deleteDoc(doc(clients.owner.firestore, 'classSubjects', v1Documents[0].id)));
    assert.equal((await getDoc(doc(clients.teacher.firestore, 'classPrograms', programId))).data()?.status, 'published');

    const secondDraft = (await clients.director.ensure(base)).data;
    assert.equal(secondDraft.draftRevisionNumber, 2);
    const revisionV2 = secondDraft.draftRevisionId;
    await clients.director.update({
      ...base,
      expectedDraftRevisionId: revisionV2,
      subjects: [{ subjectId: subjectA, coefficient: 5, weeklyHours: 7, isRequired: true, isActive: true, displayOrder: 0 }],
    });
    const v2Documents = await revisionSubjects(programId, revisionV2);
    await clients.director.publish({ ...base, expectedDraftRevisionId: revisionV2, expectedDraftStateToken: canonicalToken(v2Documents) });
    assert.equal((await db.collection('classPrograms').doc(programId).get()).data()?.publishedRevisionNumber, 2);
    assert.equal((await db.collection('classSubjects').where('programId', '==', programId).get()).size, 4);

    for (const viewport of [{ width: 360, height: 800 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
      const page = await newPage('owner', viewport);
      await page.goto(`${appUrl}/#/subjects-program`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Matières & Programmes' }).waitFor({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Programmes par classe' }).click();
      await page.locator('#class-select').selectOption(classId);
      await page.getByText('Publié', { exact: true }).waitFor({ timeout: 30_000 });
      await page.getByText(`Mathématiques ${testRunId}`).waitFor({ timeout: 30_000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 2, `Horizontal overflow ${overflow}px at ${viewport.width}px.`);
    }

    for (const role of ['secretary', 'teacher']) {
      const page = await newPage(role, { width: 390, height: 844 });
      await page.goto(`${appUrl}/#/subjects-program`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Programmes par classe' }).click();
      await page.locator('#class-select').selectOption(classId);
      await page.getByText(`Mathématiques ${testRunId}`).waitFor({ timeout: 30_000 });
      assert.equal(await page.getByRole('button', { name: /Modifier|Archiver|Créer le programme/ }).count(), 0);
    }
    for (const role of ['parent', 'student', 'boardViewer']) {
      const page = await newPage(role, { width: 390, height: 844 });
      await page.goto(`${appUrl}/#/subjects-program`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1_000);
      assert.equal(page.url().includes('/subjects-program'), false);
    }

    await clients.owner.archive({ ...base, expectedPublishedRevisionId: revisionV2 });
    const archived = (await db.collection('classPrograms').doc(programId).get()).data();
    assert.equal(archived?.status, 'archived');
    assert.equal((await db.collection('classSubjects').where('programId', '==', programId).get()).size, 4);
    const audits = await db.collection('audit_logs').where('testRunId', '==', testRunId).get();
    const programAudits = audits.docs.filter(item => String(item.data().action || '').startsWith('CLASS_PROGRAM_'));
    assert.ok(programAudits.length >= 7);
    assert.ok(programAudits.every(item => item.data().canonicalBackendAudit === true));
    assert.ok(programAudits.every(item => !/email|password|student|payment|receipt/i.test(JSON.stringify(item.data().details || {}))));
    console.log(`ITALO-W2-02 PROGRAMS STAGING E2E PASS ${testRunId}`);
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    for (const app of clientApps) await deleteApp(app).catch(() => undefined);
    const fixtureCollections = ['audit_logs', 'classSubjects', 'classPrograms', 'subjects', 'classes', 'academicYears', 'users', 'schools'];
    for (const collection of fixtureCollections) {
      const snapshot = await db.collection(collection).where('testRunId', '==', testRunId).get();
      for (const document of snapshot.docs) await document.ref.delete();
    }
    for (const uid of authUids) await adminAuth.deleteUser(uid).catch(() => undefined);
    for (const collection of fixtureCollections) {
      assert.equal((await db.collection(collection).where('testRunId', '==', testRunId).get()).size, 0, `${collection} fixture residuals`);
    }
    await deleteAdminApp(adminApp);
  }
}

run().catch(error => { console.error(error); process.exit(1); });
