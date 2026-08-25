import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { applicationDefault, cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { deleteDoc, doc, getDoc, getFirestore as getClientFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { assertAutomationBypassSecret, assertProtectedPreviewLoaded } from './staging-firebase-precheck.mjs';

const IS_PRODUCTION = process.env.TEACHER_ASSIGNMENTS_E2E_TARGET === 'production';
const PREFIX = IS_PRODUCTION ? 'PRODUCTION' : 'STAGING';
const PROJECT = IS_PRODUCTION ? 'ecoscolaire-c5861' : 'ecoscolaire-staging';
const APP_URL_KEY = `${PREFIX}_APP_URL`;
const MARKER_PREFIX = 'ITALO-PROD-TEACHER-ASSIGNMENT-TEST-';
const REQUIRED = IS_PRODUCTION
  ? [APP_URL_KEY, 'PRODUCTION_FIREBASE_API_KEY', 'PRODUCTION_FIREBASE_AUTH_DOMAIN',
    'PRODUCTION_FIREBASE_PROJECT_ID', 'PRODUCTION_FIREBASE_STORAGE_BUCKET',
    'PRODUCTION_FIREBASE_MESSAGING_SENDER_ID', 'PRODUCTION_FIREBASE_APP_ID',
    'PRODUCTION_EXPECTED_SHA', 'TEST_MARKER_PREFIX']
  : [APP_URL_KEY, 'STAGING_FIREBASE_SERVICE_ACCOUNT', 'STAGING_FIREBASE_API_KEY',
    'STAGING_FIREBASE_AUTH_DOMAIN', 'STAGING_FIREBASE_PROJECT_ID', 'STAGING_FIREBASE_STORAGE_BUCKET',
    'STAGING_FIREBASE_MESSAGING_SENDER_ID', 'STAGING_FIREBASE_APP_ID', 'VERCEL_AUTOMATION_BYPASS_SECRET'];
const REAL_DATA_COLLECTIONS = [
  'teacherAssignments', 'teacherAssignmentSlots', 'staff', 'users', 'classes', 'subjects',
  'classPrograms', 'periods', 'attendance', 'evaluations', 'grades', 'reportCards',
];
const config = () => ({ apiKey: process.env[`${PREFIX}_FIREBASE_API_KEY`], authDomain: process.env[`${PREFIX}_FIREBASE_AUTH_DOMAIN`],
  projectId: PROJECT, storageBucket: process.env[`${PREFIX}_FIREBASE_STORAGE_BUCKET`],
  messagingSenderId: process.env[`${PREFIX}_FIREBASE_MESSAGING_SENDER_ID`], appId: process.env[`${PREFIX}_FIREBASE_APP_ID`] });
const fail = (promise, code, businessCode) => assert.rejects(promise, error => {
  assert.equal(error?.code, `functions/${code}`);
  if (businessCode) assert.equal(error?.details?.businessCode, businessCode);
  return true;
});
const date = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function run() {
  const missing = REQUIRED.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing ${PREFIX.toLowerCase()} configuration: ${missing.join(', ')}`);
  assert.equal(process.env[`${PREFIX}_FIREBASE_PROJECT_ID`], PROJECT);
  if (IS_PRODUCTION) {
    assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
    assert.equal(process.env[APP_URL_KEY], 'https://ecoscolaire.vercel.app');
    assert.equal(process.env.TEST_MARKER_PREFIX, MARKER_PREFIX);
    assert.match(process.env.PRODUCTION_EXPECTED_SHA, /^[a-f0-9]{40}$/);
  } else {
    assertAutomationBypassSecret(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  }
  const appUrl = new URL(process.env[APP_URL_KEY]).origin;
  const token = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const testRunId = IS_PRODUCTION
    ? `${MARKER_PREFIX}${token}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
    : `italo-w2-03-${token}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  const fixtureIdToken = IS_PRODUCTION ? `${token}-${process.env.GITHUB_RUN_ATTEMPT || '1'}` : testRunId;
  const fixture = { testFixture: true, testRunId };
  const password = `T!${randomBytes(18).toString('base64url')}9a`;
  const ids = {
    school: `assign-school-${fixtureIdToken}`, otherSchool: `assign-cross-school-${fixtureIdToken}`,
    year: `assign-year-${fixtureIdToken}`, inactiveYear: `assign-year-off-${fixtureIdToken}`,
    classA: `assign-class-a-${fixtureIdToken}`, classB: `assign-class-b-${fixtureIdToken}`, foreignClass: `assign-class-cross-${fixtureIdToken}`, inactiveClass: `assign-class-off-${fixtureIdToken}`,
    math: `assign-math-${fixtureIdToken}`, outside: `assign-outside-${fixtureIdToken}`, foreignSubject: `assign-subject-cross-${fixtureIdToken}`, inactiveSubject: `assign-subject-off-${fixtureIdToken}`,
    staffA: `assign-staff-a-${fixtureIdToken}`, staffB: `assign-staff-b-${fixtureIdToken}`, staffUnlinked: `assign-staff-unlinked-${fixtureIdToken}`, inactiveStaff: `assign-staff-off-${fixtureIdToken}`,
    program: `assign-program-${fixtureIdToken}`, revision: `assign-revision-${fixtureIdToken}`,
    studentA: `assign-student-a-${fixtureIdToken}`, studentB: `assign-student-b-${fixtureIdToken}`,
  };
  let credential;
  if (IS_PRODUCTION) {
    credential = applicationDefault();
  } else {
    let credentials;
    try { credentials = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT); } catch { throw new Error('Invalid staging service account JSON.'); }
    assert.equal(credentials.project_id, PROJECT);
    credential = cert(credentials);
  }
  const adminApp = initializeAdminApp({ credential, projectId: PROJECT }, `assign-admin-${testRunId}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const clientApps = [];
  const authUids = [];
  const contexts = [];
  let firestoreFixturesCreated = 0;
  const roles = { superAdmin: 'superAdmin', owner: 'owner', director: 'director', secretary: 'secretary', teacher: 'teacher', teacher2: 'teacher', parent: 'parent', student: 'student', driver: 'driver', boardViewer: 'boardViewer' };

  const isRecognizedFixture = data => data.testFixture === true && typeof data.testRunId === 'string' && data.testRunId.length > 0;
  const snapshotRealData = async () => {
    if (!IS_PRODUCTION) return null;
    const result = {};
    for (const name of REAL_DATA_COLLECTIONS) {
      const snapshot = await db.collection(name).get();
      result[name] = Object.fromEntries(snapshot.docs
        .filter(item => !isRecognizedFixture(item.data()))
        .map(item => [item.id, `${item.updateTime?.toMillis() || 0}:${item.data().version ?? ''}`]));
    }
    return result;
  };
  const snapshotRealAuth = async excludedUids => {
    if (!IS_PRODUCTION) return null;
    const result = {};
    let pageToken;
    do {
      const page = await adminAuth.listUsers(1000, pageToken);
      for (const user of page.users) if (!excludedUids.has(user.uid)) {
        result[user.uid] = JSON.stringify({ disabled: user.disabled, customClaims: user.customClaims || null,
          creationTime: user.metadata.creationTime, lastSignInTime: user.metadata.lastSignInTime || null,
          providers: user.providerData.map(provider => provider.providerId).sort() });
      }
      pageToken = page.pageToken;
    } while (pageToken);
    return result;
  };
  const diffSnapshots = (before, after) => {
    const changes = [];
    for (const name of Object.keys(before || {})) {
      for (const id of new Set([...Object.keys(before[name] || {}), ...Object.keys(after[name] || {})])) {
        if (before[name]?.[id] !== after[name]?.[id]) changes.push(`${name}/${id}`);
      }
    }
    return changes;
  };
  const realBefore = await snapshotRealData();
  const authBefore = await snapshotRealAuth(new Set());

  try {
    await Promise.all([
      db.collection('schools').doc(ids.school).create({ id: ids.school, schoolId: ids.school, name: `ITALO Assignments ${testRunId}`, status: 'active', active: true, activeAcademicYearId: ids.year, academicYear: '2031-2032', version: 1, ...fixture }),
      db.collection('schools').doc(ids.otherSchool).create({ id: ids.otherSchool, schoolId: ids.otherSchool, name: `Cross ${testRunId}`, status: 'active', active: true, ...fixture }),
      db.collection('academicYears').doc(ids.year).create({ id: ids.year, schoolId: ids.school, name: '2031-2032', status: 'active', active: true, startDate: '2031-09-01', endDate: '2032-06-30', version: 1, ...fixture }),
      db.collection('academicYears').doc(ids.inactiveYear).create({ id: ids.inactiveYear, schoolId: ids.school, name: '2032-2033', status: 'inactive', active: false, startDate: '2032-09-01', endDate: '2033-06-30', version: 1, ...fixture }),
      db.collection('classes').doc(ids.classA).create({ id: ids.classA, schoolId: ids.school, name: `CM1 A ${testRunId}`, status: 'active', isActive: true, section: 'francophone', cycle: 'primaire', ...fixture }),
      db.collection('classes').doc(ids.classB).create({ id: ids.classB, schoolId: ids.school, name: `CM1 B ${testRunId}`, status: 'active', isActive: true, section: 'francophone', cycle: 'primaire', ...fixture }),
      db.collection('classes').doc(ids.foreignClass).create({ id: ids.foreignClass, schoolId: ids.otherSchool, name: `Cross ${testRunId}`, status: 'active', isActive: true, ...fixture }),
      db.collection('classes').doc(ids.inactiveClass).create({ id: ids.inactiveClass, schoolId: ids.school, name: `Inactive ${testRunId}`, status: 'inactive', isActive: false, ...fixture }),
      db.collection('subjects').doc(ids.math).create({ id: ids.math, schoolId: ids.school, name: `Mathématiques ${testRunId}`, code: 'MATH', status: 'active', isActive: true, section: 'francophone', cycles: ['primaire'], ...fixture }),
      db.collection('subjects').doc(ids.outside).create({ id: ids.outside, schoolId: ids.school, name: `Sciences ${testRunId}`, code: 'SCI', status: 'active', isActive: true, section: 'francophone', cycles: ['primaire'], ...fixture }),
      db.collection('subjects').doc(ids.foreignSubject).create({ id: ids.foreignSubject, schoolId: ids.otherSchool, name: `Cross subject ${testRunId}`, status: 'active', isActive: true, ...fixture }),
      db.collection('subjects').doc(ids.inactiveSubject).create({ id: ids.inactiveSubject, schoolId: ids.school, name: `Inactive subject ${testRunId}`, status: 'inactive', isActive: false, ...fixture }),
      db.collection('staff').doc(ids.staffA).create({ id: ids.staffA, schoolId: ids.school, name: `Enseignant A ${testRunId}`, staffType: 'teacher', employmentStatus: 'active', active: true, isActive: true, ...fixture }),
      db.collection('staff').doc(ids.staffB).create({ id: ids.staffB, schoolId: ids.school, name: `Enseignant B ${testRunId}`, staffType: 'teacher', employmentStatus: 'active', active: true, isActive: true, ...fixture }),
      db.collection('staff').doc(ids.staffUnlinked).create({ id: ids.staffUnlinked, schoolId: ids.school, name: `Enseignant sans compte ${testRunId}`, staffType: 'teacher', employmentStatus: 'active', active: true, isActive: true, ...fixture }),
      db.collection('staff').doc(ids.inactiveStaff).create({ id: ids.inactiveStaff, schoolId: ids.school, name: `Enseignant inactif ${testRunId}`, staffType: 'teacher', employmentStatus: 'inactive', active: false, isActive: false, ...fixture }),
      db.collection('classPrograms').doc(ids.program).create({ id: ids.program, schoolId: ids.school, academicYearId: ids.year, classId: ids.classA, status: 'published', publishedRevisionId: ids.revision, publishedRevisionNumber: 1, draftRevisionId: ids.revision, draftRevisionNumber: 1, hasUnpublishedChanges: false, ...fixture }),
      db.collection('classSubjects').doc(`${ids.revision}__${ids.math}`).create({ id: `${ids.revision}__${ids.math}`, programId: ids.program, schoolId: ids.school, academicYearId: ids.year, classId: ids.classA, subjectId: ids.math, revisionId: ids.revision, revisionNumber: 1, subjectNameSnapshot: 'Mathématiques', isRequired: true, displayOrder: 0, isActive: true, ...fixture }),
      db.collection('students').doc(ids.studentA).create({ id: ids.studentA, schoolId: ids.school, classId: ids.classA, name: `Élève A ${testRunId}`, schoolingStatus: 'active', active: true, ...fixture }),
      db.collection('students').doc(ids.studentB).create({ id: ids.studentB, schoolId: ids.school, classId: ids.classB, name: `Élève B ${testRunId}`, schoolingStatus: 'active', active: true, ...fixture }),
    ]);
    const profiles = {};
    for (const [key, role] of Object.entries(roles)) {
      const email = `${key}.${testRunId}@example.test`;
      const account = await adminAuth.createUser({ email, password, emailVerified: true });
      authUids.push(account.uid);
      profiles[key] = { uid: account.uid, email, role };
      await db.collection('users').doc(account.uid).create({ id: account.uid, email, role, schoolId: ids.school, active: true, isActive: true, ...fixture });
    }
    for (const [staffId, profileKey] of [[ids.staffA, 'teacher'], [ids.staffB, 'teacher2']]) {
      const userId = profiles[profileKey].uid;
      const linkId = `${ids.school}__${staffId}__${userId}`;
      await Promise.all([
        db.collection('staffUserLinkByStaff').doc(`${ids.school}__${staffId}`).create({ schoolId: ids.school, staffId, userId, linkId, isActive: true, ...fixture }),
        db.collection('staffUserLinkByUser').doc(userId).create({ schoolId: ids.school, staffId, userId, linkId, isActive: true, ...fixture }),
        db.collection('staffUserLinks').doc(linkId).create({ id: linkId, schoolId: ids.school, staffId, userId, isActive: true, ...fixture }),
      ]);
    }
    const clients = {};
    for (const [key, profile] of Object.entries(profiles)) {
      const app = initializeApp(config(), `assign-${key}-${testRunId}`); clientApps.push(app);
      await signInWithEmailAndPassword(getAuth(app), profile.email, password);
      const functions = getFunctions(app, 'us-central1');
      clients[key] = { manage: httpsCallable(functions, 'manageTeacherAssignment'), attendance: httpsCallable(functions, 'recordStudentAttendance'), firestore: getClientFirestore(app) };
    }
    const draftPayload = { action: 'CREATE_DRAFT', academicYearId: ids.year, classId: ids.classA, subjectId: ids.math, teacherStaffId: ids.staffA, ...fixture };
    const secretaryDraft = (await clients.secretary.manage({ ...draftPayload, teacherStaffId: ids.staffB })).data.assignment.id;
    await clients.secretary.manage({ action: 'UPDATE_DRAFT', assignmentId: secretaryDraft, note: 'Brouillon secrétariat' });
    await fail(clients.secretary.manage({ action: 'ACTIVATE', assignmentId: secretaryDraft }), 'permission-denied', 'PERMISSION_DENIED');
    await fail(clients.secretary.manage({ action: 'DEACTIVATE', assignmentId: secretaryDraft }), 'permission-denied', 'PERMISSION_DENIED');
    for (const action of ['UPDATE_DRAFT', 'ACTIVATE', 'DEACTIVATE']) {
      await fail(clients.teacher.manage({ action, assignmentId: secretaryDraft }), 'permission-denied', 'PERMISSION_DENIED');
    }
    const concurrent = await Promise.all([clients.owner.manage(draftPayload), clients.owner.manage(draftPayload)]);
    assert.equal(concurrent.filter(result => result.data.changed === true).length, 1);
    const assignmentId = concurrent[0].data.assignment.id;
    assert.equal((await db.collection('teacherAssignments').doc(assignmentId).get()).data()?.status, 'draft');
    await clients.secretary.manage({ action: 'UPDATE_DRAFT', assignmentId, note: 'Préparation ITALO' });
    assert.equal((await db.collection('teacherAssignments').doc(assignmentId).get()).data()?.note, 'Préparation ITALO');
    await fail(clients.secretary.manage({ action: 'ACTIVATE', assignmentId }), 'permission-denied', 'PERMISSION_DENIED');
    for (const role of ['teacher', 'parent', 'student', 'driver', 'boardViewer']) await fail(clients[role].manage(draftPayload), 'permission-denied', 'PERMISSION_DENIED');
    const activationRace = await Promise.all([
      clients.director.manage({ action: 'ACTIVATE', assignmentId }),
      clients.owner.manage({ action: 'ACTIVATE', assignmentId }),
    ]);
    assert.equal(activationRace.filter(result => result.data.changed === true).length, 1);
    assert.equal((await db.collection('teacherAssignmentSlots').doc(assignmentId).get()).data()?.isActive, true);
    const coTeachingRace = await Promise.all([
      clients.director.manage({ action: 'ACTIVATE', assignmentId: secretaryDraft }),
      clients.owner.manage({ action: 'ACTIVATE', assignmentId: secretaryDraft }),
    ]);
    assert.equal(coTeachingRace.filter(result => result.data.changed === true).length, 1);
    assert.equal((await db.collection('teacherAssignments').where('testRunId', '==', testRunId).get()).docs.filter(item => item.data().classId === ids.classA && item.data().subjectId === ids.math && item.data().status === 'active').length, 2);

    const outside = (await clients.owner.manage({ ...draftPayload, subjectId: ids.outside })).data.assignment.id;
    await fail(clients.owner.manage({ action: 'ACTIVATE', assignmentId: outside }), 'failed-precondition', 'SUBJECT_NOT_IN_PUBLISHED_PROGRAM');
    const zeroProgram = (await clients.owner.manage({ ...draftPayload, classId: ids.classB, teacherStaffId: ids.staffB })).data.assignment.id;
    await fail(clients.owner.manage({ action: 'ACTIVATE', assignmentId: zeroProgram }), 'failed-precondition', 'PROGRAM_NOT_PUBLISHED');
    const unlinked = (await clients.owner.manage({ ...draftPayload, teacherStaffId: ids.staffUnlinked })).data.assignment.id;
    await fail(clients.owner.manage({ action: 'ACTIVATE', assignmentId: unlinked }), 'failed-precondition', 'TEACHER_LINK_REQUIRED');
    const negativeDraft = async (yearId, classId, subjectId, staffId) => {
      const id = `${ids.school}__${yearId}__${classId}__${subjectId}__${staffId}`;
      await db.collection('teacherAssignments').doc(id).create({ id, assignmentId: id, schoolId: ids.school, academicYearId: yearId, classId, subjectId, teacherStaffId: staffId, status: 'draft', isActive: false, version: 1, ...fixture });
      return id;
    };
    const inactiveStaffDraft = await negativeDraft(ids.year, ids.classA, ids.math, ids.inactiveStaff);
    await fail(clients.owner.manage({ action: 'ACTIVATE', assignmentId: inactiveStaffDraft }), 'failed-precondition', 'TEACHER_INACTIVE');
    const inactiveClassDraft = await negativeDraft(ids.year, ids.inactiveClass, ids.math, ids.staffA);
    await fail(clients.owner.manage({ action: 'ACTIVATE', assignmentId: inactiveClassDraft }), 'failed-precondition', 'CLASS_INACTIVE');
    const inactiveSubjectDraft = await negativeDraft(ids.year, ids.classA, ids.inactiveSubject, ids.staffA);
    await fail(clients.owner.manage({ action: 'ACTIVATE', assignmentId: inactiveSubjectDraft }), 'failed-precondition', 'SUBJECT_INACTIVE');
    const inactiveYearDraft = await negativeDraft(ids.inactiveYear, ids.classA, ids.math, ids.staffA);
    await fail(clients.owner.manage({ action: 'ACTIVATE', assignmentId: inactiveYearDraft }), 'failed-precondition', 'ACADEMIC_YEAR_INACTIVE');
    await fail(clients.owner.manage({ ...draftPayload, academicYearId: `missing-${testRunId}` }), 'not-found', 'ACADEMIC_YEAR_NOT_FOUND');
    await fail(clients.owner.manage({ ...draftPayload, subjectId: ids.foreignSubject }), 'permission-denied', 'SCHOOL_MISMATCH');
    assert.equal((await db.collection('periods').where('testRunId', '==', testRunId).get()).size, 0);
    assert.equal((await db.collection('classPrograms').where('testRunId', '==', testRunId).get()).docs.filter(item => item.data().classId === ids.classB).length, 0);
    await fail(clients.owner.manage({ ...draftPayload, schoolId: ids.otherSchool }), 'permission-denied', 'SCHOOL_MISMATCH');
    await fail(clients.owner.manage({ ...draftPayload, classId: ids.foreignClass }), 'permission-denied', 'SCHOOL_MISMATCH');

    await assert.rejects(setDoc(doc(clients.owner.firestore, 'teacherAssignments', `direct-${testRunId}`), { schoolId: ids.school, ...fixture }));
    await assert.rejects(updateDoc(doc(clients.owner.firestore, 'teacherAssignments', assignmentId), { status: 'inactive' }));
    await assert.rejects(deleteDoc(doc(clients.owner.firestore, 'teacherAssignments', assignmentId)));
    await assert.rejects(setDoc(doc(clients.owner.firestore, 'teacherAssignmentSlots', `direct-${testRunId}`), { schoolId: ids.school, ...fixture }));
    await assert.rejects(updateDoc(doc(clients.owner.firestore, 'teacherAssignmentSlots', assignmentId), { isActive: false }));
    await assert.rejects(deleteDoc(doc(clients.owner.firestore, 'teacherAssignmentSlots', assignmentId)));
    assert.equal((await getDoc(doc(clients.teacher.firestore, 'teacherAssignments', assignmentId))).data()?.status, 'active');
    await assert.rejects(getDoc(doc(clients.teacher2.firestore, 'teacherAssignments', assignmentId)));

    await clients.teacher.attendance({ studentId: ids.studentA, date: date(), status: 'present' });
    await fail(clients.teacher.attendance({ studentId: ids.studentB, date: date(), status: 'present' }), 'permission-denied');
    await clients.owner.manage({ action: 'DEACTIVATE', assignmentId, reason: 'E2E' });
    await fail(clients.teacher.attendance({ studentId: ids.studentA, date: date(), status: 'late' }), 'permission-denied');
    assert.equal((await db.collection('teacherAssignments').doc(assignmentId).get()).data()?.status, 'inactive');

    for (const viewport of [{ width: 360, height: 800 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport }); contexts.push(context);
      const page = await context.newPage();
      if (!IS_PRODUCTION) await page.route(`${appUrl}/**`, route => route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' } }));
      await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
      if (!IS_PRODUCTION) assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: page.url() });
      await page.getByTestId('login-email').fill(profiles.owner.email); await page.getByTestId('login-password').fill(password); await page.getByTestId('login-submit').click();
      await page.waitForURL(url => !url.hash.includes('/login'), { timeout: 60_000 });
      await page.goto(`${appUrl}/#/subjects-program`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Affectation des Enseignants' }).click();
      await page.getByRole('heading', { name: 'Affectations enseignants' }).waitFor({ timeout: 30_000 });
      await page.getByLabel('Statut').selectOption('inactive');
      await page.getByRole('cell', { name: `Enseignant A ${testRunId}`, exact: true }).waitFor({ timeout: 30_000 });
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Affectation des Enseignants' }).click();
      await page.getByText('PROGRAMME NON PUBLIÉ').first().waitFor({ timeout: 30_000 });
      assert.ok(await page.getByRole('button', { name: 'Créer un brouillon' }).isVisible());
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 2);
    }
    for (const collection of ['evaluations', 'grades', 'reportCards']) assert.equal((await db.collection(collection).where('testRunId', '==', testRunId).get()).size, 0, `${collection} side effects`);
    const audits = await db.collection('audit_logs').where('testRunId', '==', testRunId).get();
    const assignmentAudits = audits.docs.filter(item => String(item.data().action || '').startsWith('TEACHER_ASSIGNMENT_'));
    assert.ok(assignmentAudits.every(item => item.data().canonicalBackendAudit === true));
    assert.ok(assignmentAudits.every(item => !/email|password|name|phone|address|payment|receipt/i.test(JSON.stringify(item.data().details || {}))));
    const actions = new Set(assignmentAudits.map(item => item.data().action));
    for (const action of ['TEACHER_ASSIGNMENT_CREATED', 'TEACHER_ASSIGNMENT_UPDATED', 'TEACHER_ASSIGNMENT_ACTIVATED', 'TEACHER_ASSIGNMENT_DEACTIVATED']) assert.ok(actions.has(action));
    console.log(`ITALO-W2-03 TEACHER ASSIGNMENTS ${PREFIX} E2E PASS ${testRunId}`);
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    for (const app of clientApps) await deleteApp(app).catch(() => undefined);
    const collections = ['attendance', 'audit_logs', 'teacherAssignmentSlots', 'teacherAssignments', 'staffUserLinkByUser', 'staffUserLinkByStaff', 'staffUserLinks', 'students', 'classSubjects', 'classPrograms', 'staff', 'subjects', 'classes', 'periods', 'academicYears', 'users', 'schools'];
    for (const name of collections) {
      const snapshot = await db.collection(name).where('testRunId', '==', testRunId).get();
      firestoreFixturesCreated += snapshot.size;
      for (const document of snapshot.docs) await document.ref.delete();
    }
    for (const uid of authUids) await adminAuth.deleteUser(uid).catch(() => undefined);
    for (const name of collections) assert.equal((await db.collection(name).where('testRunId', '==', testRunId).get()).size, 0, `${name} residuals`);
    for (const uid of authUids) await assert.rejects(adminAuth.getUser(uid), error => error?.code === 'auth/user-not-found');
    if (IS_PRODUCTION) {
      const realChanges = diffSnapshots(realBefore, await snapshotRealData());
      assert.equal(realChanges.length, 0, `Production real documents changed: ${JSON.stringify(realChanges)}`);
      const authAfter = await snapshotRealAuth(new Set(authUids));
      assert.deepEqual(authAfter, authBefore, 'Production real Auth accounts changed.');
    }
    console.log(`ITALO-W2-03 TEACHER ASSIGNMENTS ${PREFIX} CLEANUP PASS ${testRunId} firestoreFixturesCreated=${firestoreFixturesCreated} firestoreFixturesRemoved=${firestoreFixturesCreated} authFixturesCreated=${authUids.length} authFixturesRemoved=${authUids.length} firestoreResiduals=0 authResiduals=0 orphans=0 realDocumentsModified=0 realDocumentsDeleted=0 realAuthModified=0`);
    await deleteAdminApp(adminApp);
  }
}

run().catch(error => { console.error(error); process.exit(1); });
