import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { deleteDoc, doc, getDoc, getFirestore as getClientFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { assertAutomationBypassSecret, assertProtectedPreviewLoaded } from './staging-firebase-precheck.mjs';

const PROJECT = 'ecoscolaire-staging';
const REQUIRED = ['STAGING_APP_URL', 'STAGING_FIREBASE_SERVICE_ACCOUNT', 'STAGING_FIREBASE_API_KEY',
  'STAGING_FIREBASE_AUTH_DOMAIN', 'STAGING_FIREBASE_PROJECT_ID', 'STAGING_FIREBASE_STORAGE_BUCKET',
  'STAGING_FIREBASE_MESSAGING_SENDER_ID', 'STAGING_FIREBASE_APP_ID', 'VERCEL_AUTOMATION_BYPASS_SECRET'];
const config = () => ({ apiKey: process.env.STAGING_FIREBASE_API_KEY, authDomain: process.env.STAGING_FIREBASE_AUTH_DOMAIN,
  projectId: PROJECT, storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.STAGING_FIREBASE_MESSAGING_SENDER_ID, appId: process.env.STAGING_FIREBASE_APP_ID });
const fail = (promise, code, businessCode) => assert.rejects(promise, error => {
  assert.equal(error?.code, `functions/${code}`);
  if (businessCode) assert.equal(error?.details?.businessCode, businessCode);
  return true;
});
const date = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function run() {
  const missing = REQUIRED.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing staging configuration: ${missing.join(', ')}`);
  assert.equal(process.env.STAGING_FIREBASE_PROJECT_ID, PROJECT);
  assertAutomationBypassSecret(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  const appUrl = new URL(process.env.STAGING_APP_URL).origin;
  const token = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-');
  const testRunId = `italo-w2-03-${token}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  const fixture = { testFixture: true, testRunId };
  const password = `T!${randomBytes(18).toString('base64url')}9a`;
  const ids = {
    school: `assign-school-${testRunId}`, otherSchool: `assign-cross-school-${testRunId}`,
    year: `assign-year-${testRunId}`, classA: `assign-class-a-${testRunId}`, classB: `assign-class-b-${testRunId}`, foreignClass: `assign-class-cross-${testRunId}`,
    math: `assign-math-${testRunId}`, outside: `assign-outside-${testRunId}`,
    staffA: `assign-staff-a-${testRunId}`, staffB: `assign-staff-b-${testRunId}`, staffUnlinked: `assign-staff-unlinked-${testRunId}`,
    program: `assign-program-${testRunId}`, revision: `assign-revision-${testRunId}`,
    studentA: `assign-student-a-${testRunId}`, studentB: `assign-student-b-${testRunId}`,
  };
  let credentials;
  try { credentials = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT); } catch { throw new Error('Invalid staging service account JSON.'); }
  assert.equal(credentials.project_id, PROJECT);
  const adminApp = initializeAdminApp({ credential: cert(credentials), projectId: PROJECT }, `assign-admin-${testRunId}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const clientApps = [];
  const authUids = [];
  const contexts = [];
  const roles = { superAdmin: 'superAdmin', owner: 'owner', director: 'director', secretary: 'secretary', teacher: 'teacher', teacher2: 'teacher', parent: 'parent', student: 'student', driver: 'driver', boardViewer: 'boardViewer' };

  try {
    await Promise.all([
      db.collection('schools').doc(ids.school).create({ id: ids.school, schoolId: ids.school, name: `ITALO Assignments ${testRunId}`, status: 'active', active: true, activeAcademicYearId: ids.year, academicYear: '2031-2032', version: 1, ...fixture }),
      db.collection('schools').doc(ids.otherSchool).create({ id: ids.otherSchool, schoolId: ids.otherSchool, name: `Cross ${testRunId}`, status: 'active', active: true, ...fixture }),
      db.collection('academicYears').doc(ids.year).create({ id: ids.year, schoolId: ids.school, name: '2031-2032', status: 'active', active: true, startDate: '2031-09-01', endDate: '2032-06-30', version: 1, ...fixture }),
      db.collection('classes').doc(ids.classA).create({ id: ids.classA, schoolId: ids.school, name: `CM1 A ${testRunId}`, status: 'active', isActive: true, section: 'francophone', cycle: 'primaire', ...fixture }),
      db.collection('classes').doc(ids.classB).create({ id: ids.classB, schoolId: ids.school, name: `CM1 B ${testRunId}`, status: 'active', isActive: true, section: 'francophone', cycle: 'primaire', ...fixture }),
      db.collection('classes').doc(ids.foreignClass).create({ id: ids.foreignClass, schoolId: ids.otherSchool, name: `Cross ${testRunId}`, status: 'active', isActive: true, ...fixture }),
      db.collection('subjects').doc(ids.math).create({ id: ids.math, schoolId: ids.school, name: `Mathématiques ${testRunId}`, code: 'MATH', status: 'active', isActive: true, section: 'francophone', cycles: ['primaire'], ...fixture }),
      db.collection('subjects').doc(ids.outside).create({ id: ids.outside, schoolId: ids.school, name: `Sciences ${testRunId}`, code: 'SCI', status: 'active', isActive: true, section: 'francophone', cycles: ['primaire'], ...fixture }),
      db.collection('staff').doc(ids.staffA).create({ id: ids.staffA, schoolId: ids.school, name: `Enseignant A ${testRunId}`, staffType: 'teacher', employmentStatus: 'active', active: true, isActive: true, ...fixture }),
      db.collection('staff').doc(ids.staffB).create({ id: ids.staffB, schoolId: ids.school, name: `Enseignant B ${testRunId}`, staffType: 'teacher', employmentStatus: 'active', active: true, isActive: true, ...fixture }),
      db.collection('staff').doc(ids.staffUnlinked).create({ id: ids.staffUnlinked, schoolId: ids.school, name: `Enseignant sans compte ${testRunId}`, staffType: 'teacher', employmentStatus: 'active', active: true, isActive: true, ...fixture }),
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
    const concurrent = await Promise.all([clients.owner.manage(draftPayload), clients.owner.manage(draftPayload)]);
    assert.equal(concurrent.filter(result => result.data.changed === true).length, 1);
    const assignmentId = concurrent[0].data.assignment.id;
    assert.equal((await db.collection('teacherAssignments').doc(assignmentId).get()).data()?.status, 'draft');
    await clients.secretary.manage({ action: 'UPDATE_DRAFT', assignmentId, note: 'Préparation ITALO' });
    assert.equal((await db.collection('teacherAssignments').doc(assignmentId).get()).data()?.note, 'Préparation ITALO');
    await fail(clients.secretary.manage({ action: 'ACTIVATE', assignmentId }), 'permission-denied', 'PERMISSION_DENIED');
    for (const role of ['teacher', 'parent', 'student', 'driver', 'boardViewer']) await fail(clients[role].manage(draftPayload), 'permission-denied', 'PERMISSION_DENIED');
    await clients.director.manage({ action: 'ACTIVATE', assignmentId });
    assert.equal((await db.collection('teacherAssignmentSlots').doc(assignmentId).get()).data()?.isActive, true);

    const outside = (await clients.owner.manage({ ...draftPayload, subjectId: ids.outside })).data.assignment.id;
    await fail(clients.owner.manage({ action: 'ACTIVATE', assignmentId: outside }), 'failed-precondition', 'SUBJECT_NOT_IN_PUBLISHED_PROGRAM');
    const zeroProgram = (await clients.owner.manage({ ...draftPayload, classId: ids.classB, teacherStaffId: ids.staffB })).data.assignment.id;
    await fail(clients.owner.manage({ action: 'ACTIVATE', assignmentId: zeroProgram }), 'failed-precondition', 'PROGRAM_NOT_PUBLISHED');
    const unlinked = (await clients.owner.manage({ ...draftPayload, teacherStaffId: ids.staffUnlinked })).data.assignment.id;
    await fail(clients.owner.manage({ action: 'ACTIVATE', assignmentId: unlinked }), 'failed-precondition', 'TEACHER_LINK_REQUIRED');
    assert.equal((await db.collection('periods').where('testRunId', '==', testRunId).get()).size, 0);
    assert.equal((await db.collection('classPrograms').where('testRunId', '==', testRunId).get()).docs.filter(item => item.data().classId === ids.classB).length, 0);
    await fail(clients.owner.manage({ ...draftPayload, schoolId: ids.otherSchool }), 'permission-denied', 'SCHOOL_MISMATCH');
    await fail(clients.owner.manage({ ...draftPayload, classId: ids.foreignClass }), 'permission-denied', 'SCHOOL_MISMATCH');

    await assert.rejects(setDoc(doc(clients.owner.firestore, 'teacherAssignments', `direct-${testRunId}`), { schoolId: ids.school, ...fixture }));
    await assert.rejects(updateDoc(doc(clients.owner.firestore, 'teacherAssignments', assignmentId), { status: 'inactive' }));
    await assert.rejects(deleteDoc(doc(clients.owner.firestore, 'teacherAssignments', assignmentId)));
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
      await page.route(`${appUrl}/**`, route => route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' } }));
      await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' }); assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: page.url() });
      await page.getByTestId('login-email').fill(profiles.owner.email); await page.getByTestId('login-password').fill(password); await page.getByTestId('login-submit').click();
      await page.waitForURL(url => !url.hash.includes('/login'), { timeout: 60_000 });
      await page.goto(`${appUrl}/#/subjects-program`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Affectation des Enseignants' }).click();
      await page.getByRole('heading', { name: 'Affectations enseignants' }).waitFor({ timeout: 30_000 });
      await page.getByLabel('Statut').selectOption('inactive'); await page.getByText(`Enseignant A ${testRunId}`).waitFor({ timeout: 30_000 });
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Affectation des Enseignants' }).click();
      await page.getByText('PROGRAMME NON PUBLIÉ').first().waitFor({ timeout: 30_000 });
      assert.ok(await page.getByRole('button', { name: 'Créer un brouillon' }).isVisible());
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 2);
    }
    const audits = await db.collection('audit_logs').where('testRunId', '==', testRunId).get();
    const actions = new Set(audits.docs.map(item => item.data().action));
    for (const action of ['TEACHER_ASSIGNMENT_CREATED', 'TEACHER_ASSIGNMENT_UPDATED', 'TEACHER_ASSIGNMENT_ACTIVATED', 'TEACHER_ASSIGNMENT_DEACTIVATED']) assert.ok(actions.has(action));
    console.log(`ITALO-W2-03 TEACHER ASSIGNMENTS STAGING E2E PASS ${testRunId}`);
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    for (const app of clientApps) await deleteApp(app).catch(() => undefined);
    const collections = ['attendance', 'audit_logs', 'teacherAssignmentSlots', 'teacherAssignments', 'staffUserLinkByUser', 'staffUserLinkByStaff', 'staffUserLinks', 'students', 'classSubjects', 'classPrograms', 'staff', 'subjects', 'classes', 'periods', 'academicYears', 'users', 'schools'];
    for (const name of collections) {
      const snapshot = await db.collection(name).where('testRunId', '==', testRunId).get();
      for (const document of snapshot.docs) await document.ref.delete();
    }
    for (const uid of authUids) await adminAuth.deleteUser(uid).catch(() => undefined);
    for (const name of collections) assert.equal((await db.collection(name).where('testRunId', '==', testRunId).get()).size, 0, `${name} residuals`);
    for (const uid of authUids) await assert.rejects(adminAuth.getUser(uid), error => error?.code === 'auth/user-not-found');
    console.log(`ITALO-W2-03 TEACHER ASSIGNMENTS STAGING CLEANUP PASS ${testRunId} firestoreResiduals=0 authResiduals=0 orphans=0`);
    await deleteAdminApp(adminApp);
  }
}

run().catch(error => { console.error(error); process.exit(1); });
