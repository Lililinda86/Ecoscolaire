import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore as getClientFirestore, query, setDoc, updateDoc, where } from 'firebase/firestore';
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

const captureGradeState = async (db, evaluationId) => {
  const [evaluation, grades] = await Promise.all([
    db.collection('evaluations').doc(evaluationId).get(),
    db.collection('grades').where('evaluationId', '==', evaluationId).get(),
  ]);
  return {
    evaluation: {
      exists: evaluation.exists,
      updateTime: evaluation.updateTime?.toMillis(),
      data: JSON.stringify(evaluation.data()),
    },
    grades: grades.docs.map(item => ({
      id: item.id,
      updateTime: item.updateTime?.toMillis(),
      data: JSON.stringify(item.data()),
    })).sort((left, right) => left.id.localeCompare(right.id)),
  };
};

const expectInvalidNumericInputRejected = async ({ db, evaluationId, valueName, request }) => {
  const before = await captureGradeState(db, evaluationId);
  const error = await request().then(() => undefined, reason => reason);
  assert.ok(error, `${valueName} request unexpectedly succeeded`);

  const backendRejection = error?.code === 'functions/invalid-argument'
    && error?.details?.businessCode === 'INVALID_SCORE';
  const clientRejection = error?.name === 'Error'
    && error?.code === undefined
    && error?.message === `Data cannot be encoded in JSON: ${valueName}`;
  assert.ok(backendRejection || clientRejection,
    `${valueName} rejection was neither Firebase serialization nor backend INVALID_SCORE: ${error?.message || error}`);

  const after = await captureGradeState(db, evaluationId);
  assert.deepEqual(after, before, `${valueName} rejection modified Evaluation/Grade state`);
  return clientRejection ? 'client' : 'backend';
};

async function run() {
  const missing = REQUIRED.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing staging configuration: ${missing.join(', ')}`);
  assert.equal(process.env.STAGING_FIREBASE_PROJECT_ID, PROJECT);
  assertAutomationBypassSecret(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  const appUrl = new URL(process.env.STAGING_APP_URL).origin;
  const token = `${String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '-')}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  const testRunId = `italo-w2-04-${token}`;
  const fixture = { testFixture: true, testRunId };
  const password = `T!${randomBytes(18).toString('base64url')}9a`;
  const ids = {
    school: `grade-school-${token}`, emptySchool: `grade-empty-school-${token}`, otherSchool: `grade-other-school-${token}`,
    year: `grade-year-${token}`, period: `grade-period-${token}`, draftPeriod: `grade-draft-period-${token}`, closedPeriod: `grade-closed-period-${token}`,
    classA: `grade-class-a-${token}`, classB: `grade-class-b-${token}`, subject: `grade-math-${token}`, outsideSubject: `grade-science-${token}`,
    program: `grade-program-${token}`, revision: `grade-revision-${token}`, classSubject: `grade-cs-${token}`,
    staff: `grade-staff-${token}`, coStaff: `grade-co-staff-${token}`, unlinkedStaff: `grade-unlinked-staff-${token}`,
    assignment: `grade-assignment-${token}`, coAssignment: `grade-co-assignment-${token}`,
    inactiveAssignment: `grade-inactive-assignment-${token}`, outsideAssignment: `grade-outside-assignment-${token}`, noProgramAssignment: `grade-no-program-assignment-${token}`,
    unlinkedAssignment: `grade-unlinked-assignment-${token}`,
    student0: `grade-student-zero-${token}`, studentMax: `grade-student-max-${token}`,
    studentAbsent: `grade-student-absent-${token}`, studentOtherClass: `grade-student-other-${token}`,
    evaluation: `grade-evaluation-${token}`, cancelledEvaluation: `grade-cancelled-${token}`,
  };
  let credentials;
  try { credentials = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT); } catch { throw new Error('Invalid staging service account JSON.'); }
  assert.equal(credentials.project_id, PROJECT);
  const adminApp = initializeAdminApp({ credential: cert(credentials), projectId: PROJECT }, `grades-admin-${testRunId}`);
  const db = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const browser = await chromium.launch({ headless: true });
  const clientApps = [];
  const contexts = [];
  const authUids = [];
  let fixturesCreated = 0;

  try {
    await Promise.all([
      db.collection('schools').doc(ids.school).create({ id: ids.school, schoolId: ids.school, name: `ITALO Grades ${testRunId}`, status: 'active', active: true, activeAcademicYearId: ids.year, academicYear: '2031-2032', version: 1, ...fixture }),
      db.collection('schools').doc(ids.emptySchool).create({ id: ids.emptySchool, schoolId: ids.emptySchool, name: `ITALO Empty ${testRunId}`, status: 'active', active: true, version: 1, ...fixture }),
      db.collection('schools').doc(ids.otherSchool).create({ id: ids.otherSchool, schoolId: ids.otherSchool, name: `ITALO Other ${testRunId}`, status: 'active', active: true, version: 1, ...fixture }),
      db.collection('academicYears').doc(ids.year).create({ id: ids.year, schoolId: ids.school, name: '2031-2032', status: 'active', active: true, startDate: '2031-09-01', endDate: '2032-06-30', version: 1, ...fixture }),
      db.collection('periods').doc(ids.period).create({ id: ids.period, schoolId: ids.school, academicYearId: ids.year, name: 'Trimestre 1', status: 'open', startDate: '2031-09-01', endDate: '2031-12-20', version: 1, ...fixture }),
      db.collection('periods').doc(ids.draftPeriod).create({ id: ids.draftPeriod, schoolId: ids.school, academicYearId: ids.year, name: 'Trimestre brouillon', status: 'draft', startDate: '2032-01-01', endDate: '2032-03-31', version: 1, ...fixture }),
      db.collection('periods').doc(ids.closedPeriod).create({ id: ids.closedPeriod, schoolId: ids.school, academicYearId: ids.year, name: 'Trimestre clos', status: 'closed', startDate: '2032-01-01', endDate: '2032-03-31', version: 1, ...fixture }),
      db.collection('classes').doc(ids.classA).create({ id: ids.classA, schoolId: ids.school, name: `CM1 A ${testRunId}`, type: 'primary', section: 'francophone', cycle: 'primaire', status: 'active', active: true, isActive: true, ...fixture }),
      db.collection('classes').doc(ids.classB).create({ id: ids.classB, schoolId: ids.school, name: `CM1 B ${testRunId}`, type: 'primary', section: 'francophone', cycle: 'primaire', status: 'active', active: true, isActive: true, ...fixture }),
      db.collection('subjects').doc(ids.subject).create({ id: ids.subject, schoolId: ids.school, name: 'Mathématiques', code: 'MATH', status: 'active', isActive: true, ...fixture }),
      db.collection('subjects').doc(ids.outsideSubject).create({ id: ids.outsideSubject, schoolId: ids.school, name: 'Sciences', code: 'SCI', status: 'active', isActive: true, ...fixture }),
      db.collection('classPrograms').doc(ids.program).create({ id: ids.program, schoolId: ids.school, academicYearId: ids.year, classId: ids.classA, status: 'published', publishedRevisionId: ids.revision, publishedRevisionNumber: 1, ...fixture }),
      db.collection('classSubjects').doc(ids.classSubject).create({ id: ids.classSubject, programId: ids.program, schoolId: ids.school, academicYearId: ids.year, classId: ids.classA, subjectId: ids.subject, revisionId: ids.revision, revisionNumber: 1, isActive: true, displayOrder: 0, ...fixture }),
      db.collection('staff').doc(ids.staff).create({ id: ids.staff, schoolId: ids.school, name: `Enseignant ${testRunId}`, staffType: 'teacher', employmentStatus: 'active', status: 'active', active: true, isActive: true, ...fixture }),
      db.collection('staff').doc(ids.coStaff).create({ id: ids.coStaff, schoolId: ids.school, name: `Co-enseignant ${testRunId}`, staffType: 'teacher', employmentStatus: 'active', status: 'active', active: true, isActive: true, ...fixture }),
      db.collection('staff').doc(ids.unlinkedStaff).create({ id: ids.unlinkedStaff, schoolId: ids.school, name: `Non lié ${testRunId}`, staffType: 'teacher', employmentStatus: 'active', status: 'active', active: true, isActive: true, ...fixture }),
      ...[ids.student0, ids.studentMax, ids.studentAbsent].map((id, index) => db.collection('students').doc(id).create({ id, schoolId: ids.school, academicYearId: ids.year, classId: ids.classA, name: `Élève ${index} ${testRunId}`, gender: 'F', section: 'francophone', schoolingStatus: 'active', status: 'active', active: true, ...fixture })),
      db.collection('students').doc(ids.studentOtherClass).create({ id: ids.studentOtherClass, schoolId: ids.school, academicYearId: ids.year, classId: ids.classB, name: `Élève autre ${testRunId}`, gender: 'M', section: 'francophone', schoolingStatus: 'active', status: 'active', active: true, ...fixture }),
    ]);

    const roleSpecs = { owner: ['owner', ids.school], director: ['director', ids.school], secretary: ['secretary', ids.school],
      teacher: ['teacher', ids.school], coTeacher: ['teacher', ids.school], unlinkedTeacher: ['teacher', ids.school], parent: ['parent', ids.school], student: ['student', ids.school],
      boardViewer: ['boardViewer', ids.school], emptyOwner: ['owner', ids.emptySchool] };
    const profiles = {};
    for (const [key, [role, schoolId]] of Object.entries(roleSpecs)) {
      const email = `${key}.${testRunId}@example.test`;
      const account = await adminAuth.createUser({ email, password, emailVerified: true }); authUids.push(account.uid);
      profiles[key] = { uid: account.uid, email, role, schoolId };
      await db.collection('users').doc(account.uid).create({ id: account.uid, email, role, schoolId, active: true, isActive: true, ...fixture });
    }
    for (const [staffId, key] of [[ids.staff, 'teacher'], [ids.coStaff, 'coTeacher']]) {
      const userId = profiles[key].uid; const linkId = `${ids.school}__${staffId}__${userId}`;
      await Promise.all([
        db.collection('staffUserLinkByUser').doc(userId).create({ schoolId: ids.school, staffId, userId, linkId, isActive: true, ...fixture }),
        db.collection('staffUserLinkByStaff').doc(`${ids.school}__${staffId}`).create({ schoolId: ids.school, staffId, userId, linkId, isActive: true, ...fixture }),
        db.collection('staffUserLinks').doc(linkId).create({ id: linkId, schoolId: ids.school, staffId, userId, isActive: true, ...fixture }),
      ]);
    }
    const assignment = (id, teacherStaffId, teacherUserId, subjectId, active) => ({ id, assignmentId: id, schoolId: ids.school,
      academicYearId: ids.year, classId: ids.classA, subjectId, teacherStaffId, teacherUserId,
      status: active ? 'active' : 'inactive', isActive: active, sourceProgramId: ids.program,
      sourcePublishedRevisionId: ids.revision, sourceClassSubjectId: ids.classSubject, version: 1, ...fixture });
    await Promise.all([
      db.collection('teacherAssignments').doc(ids.assignment).create(assignment(ids.assignment, ids.staff, profiles.teacher.uid, ids.subject, true)),
      db.collection('teacherAssignments').doc(ids.coAssignment).create(assignment(ids.coAssignment, ids.coStaff, profiles.coTeacher.uid, ids.subject, true)),
      db.collection('teacherAssignments').doc(ids.inactiveAssignment).create(assignment(ids.inactiveAssignment, ids.staff, profiles.teacher.uid, ids.subject, false)),
      db.collection('teacherAssignments').doc(ids.outsideAssignment).create(assignment(ids.outsideAssignment, ids.staff, profiles.teacher.uid, ids.outsideSubject, true)),
      db.collection('teacherAssignments').doc(ids.noProgramAssignment).create({ ...assignment(ids.noProgramAssignment, ids.staff, profiles.teacher.uid, ids.subject, true), classId: ids.classB, sourceProgramId: `missing-program-${token}` }),
      db.collection('teacherAssignments').doc(ids.unlinkedAssignment).create(assignment(ids.unlinkedAssignment, ids.unlinkedStaff, profiles.unlinkedTeacher.uid, ids.subject, true)),
    ]);

    const clients = {};
    for (const [key, profile] of Object.entries(profiles)) {
      const app = initializeApp(config(), `grades-${key}-${testRunId}`); clientApps.push(app);
      await signInWithEmailAndPassword(getAuth(app), profile.email, password);
      const functions = getFunctions(app, 'us-central1');
      clients[key] = { evaluation: httpsCallable(functions, 'manageEvaluation'), grades: httpsCallable(functions, 'recordGradesBatch'), firestore: getClientFirestore(app) };
    }
    const profile = { title: 'Contrôle bornes', type: 'devoir', date: '2031-10-10', maxScore: 20, weight: 2, ...fixture };
    const create = { action: 'CREATE_DRAFT', evaluationId: ids.evaluation, academicYearId: ids.year, periodId: ids.period,
      classId: ids.classA, subjectId: ids.subject, teacherAssignmentId: ids.assignment, profile };
    const first = await clients.teacher.evaluation(create); assert.equal(first.data.changed, true);
    const retry = await clients.teacher.evaluation(create); assert.equal(retry.data.changed, false);
    await fail(clients.teacher.evaluation({ ...create, profile: { ...profile, title: 'Autre contenu' } }), 'already-exists', 'IDEMPOTENCY_CONFLICT');
    await fail(clients.secretary.evaluation({ ...create, evaluationId: `secretary-${token}` }), 'permission-denied', 'PERMISSION_DENIED');
    await fail(clients.teacher.evaluation({ ...create, evaluationId: `inactive-${token}`, teacherAssignmentId: ids.inactiveAssignment }), 'failed-precondition', 'TEACHER_ASSIGNMENT_NOT_ACTIVE');
    await fail(clients.teacher.evaluation({ ...create, evaluationId: `outside-${token}`, subjectId: ids.outsideSubject, teacherAssignmentId: ids.outsideAssignment }), 'failed-precondition', 'SUBJECT_NOT_IN_PUBLISHED_PROGRAM');
    await fail(clients.unlinkedTeacher.evaluation({ ...create, evaluationId: `unlinked-${token}`, teacherAssignmentId: ids.unlinkedAssignment }), 'failed-precondition', 'TEACHER_LINK_REQUIRED');
    await fail(clients.teacher.evaluation({ ...create, evaluationId: `draft-period-${token}`, periodId: ids.draftPeriod, profile: { ...profile, date: '2032-02-01' } }), 'failed-precondition', 'PERIOD_NOT_OPEN');
    await fail(clients.teacher.evaluation({ ...create, evaluationId: `closed-${token}`, periodId: ids.closedPeriod, profile: { ...profile, date: '2032-02-01' } }), 'failed-precondition', 'PERIOD_NOT_OPEN');
    await fail(clients.teacher.evaluation({ ...create, evaluationId: `no-program-${token}`, classId: ids.classB, teacherAssignmentId: ids.noProgramAssignment }), 'failed-precondition', 'PROGRAM_NOT_PUBLISHED');
    await fail(clients.teacher.evaluation({ ...create, evaluationId: `outside-date-${token}`, profile: { ...profile, date: '2032-05-01' } }), 'failed-precondition', 'DATE_OUTSIDE_PERIOD');
    await fail(clients.teacher.evaluation({ ...create, evaluationId: `cross-${token}`, schoolId: ids.otherSchool }), 'permission-denied', 'SCHOOL_MISMATCH');
    await fail(clients.coTeacher.evaluation({ action: 'UPDATE_DRAFT', evaluationId: ids.evaluation, expectedVersion: 1, profile }), 'permission-denied', 'EVALUATION_OWNERSHIP_REQUIRED');
    await clients.teacher.evaluation({ action: 'OPEN', evaluationId: ids.evaluation, expectedVersion: 1 });

    const validRows = [
      { studentId: ids.student0, resultStatus: 'scored', score: 0, expectedVersion: 0 },
      { studentId: ids.studentMax, resultStatus: 'scored', score: 20, expectedVersion: 0 },
      { studentId: ids.studentAbsent, resultStatus: 'absent', expectedVersion: 0 },
    ];
    await fail(clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `negative-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'scored', score: -0.1 }] }), 'invalid-argument', 'INVALID_SCORE');
    await fail(clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `above-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'scored', score: 20.1 }] }), 'invalid-argument', 'INVALID_SCORE');
    const nanRejectionLayer = await expectInvalidNumericInputRejected({ db, evaluationId: ids.evaluation, valueName: 'NaN',
      request: () => clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `nan-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'scored', score: Number.NaN }] }) });
    const infinityRejectionLayer = await expectInvalidNumericInputRejected({ db, evaluationId: ids.evaluation, valueName: 'Infinity',
      request: () => clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `infinity-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'scored', score: Number.POSITIVE_INFINITY }] }) });
    await fail(clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `absence-score-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'absent', score: 0 }] }), 'invalid-argument', 'SCORE_STATUS_CONFLICT');
    await fail(clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `duplicate-${token}`, rows: [validRows[0], validRows[0]] }), 'invalid-argument', 'DUPLICATE_STUDENT');
    const beforeAtomic = (await db.collection('grades').where('testRunId', '==', testRunId).get()).size;
    await fail(clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `atomic-${token}`, rows: [validRows[0], { studentId: ids.studentOtherClass, resultStatus: 'scored', score: 10 }] }), 'failed-precondition', 'STUDENT_NOT_ELIGIBLE');
    assert.equal((await db.collection('grades').where('testRunId', '==', testRunId).get()).size, beforeAtomic);
    const batch = await clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `valid-${token}`, rows: validRows });
    assert.equal(batch.data.changed, true); assert.equal(batch.data.count, 3);
    const sameBatch = await clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `valid-${token}`, rows: validRows });
    assert.equal(sameBatch.data.idempotent, true);
    await fail(clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `valid-${token}`, rows: [validRows[0]] }), 'already-exists', 'IDEMPOTENCY_CONFLICT');
    const gradeDocs = (await db.collection('grades').where('evaluationId', '==', ids.evaluation).get()).docs;
    assert.equal(gradeDocs.length, 3);
    assert.equal(gradeDocs.find(item => item.data().studentId === ids.student0).data().score, 0);
    assert.equal(gradeDocs.find(item => item.data().studentId === ids.studentMax).data().score, 20);
    assert.equal(gradeDocs.find(item => item.data().studentId === ids.studentAbsent).data().score, undefined);
    assert.equal(gradeDocs.find(item => item.data().studentId === ids.studentAbsent).data().resultStatus, 'absent');

    await clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `correct-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'scored', score: 10, expectedVersion: 1 }] });
    const race = await Promise.allSettled([
      clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `race-a-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'scored', score: 11, expectedVersion: 2 }] }),
      clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `race-b-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'scored', score: 12, expectedVersion: 2 }] }),
    ]);
    assert.equal(race.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal((await db.collection('grades').where('evaluationId', '==', ids.evaluation).get()).size, 3);
    await fail(clients.coTeacher.grades({ evaluationId: ids.evaluation, requestId: `co-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'scored', score: 8, expectedVersion: 3 }] }), 'permission-denied', 'EVALUATION_OWNERSHIP_REQUIRED');
    await fail(clients.secretary.grades({ evaluationId: ids.evaluation, requestId: `secretary-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'scored', score: 8, expectedVersion: 3 }] }), 'permission-denied', 'PERMISSION_DENIED');
    await fail(clients.parent.grades({ evaluationId: ids.evaluation, requestId: `parent-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'scored', score: 8, expectedVersion: 3 }] }), 'permission-denied', 'PERMISSION_DENIED');
    await fail(clients.student.grades({ evaluationId: ids.evaluation, requestId: `student-${token}`, rows: [{ studentId: ids.student0, resultStatus: 'scored', score: 8, expectedVersion: 3 }] }), 'permission-denied', 'PERMISSION_DENIED');

    await clients.teacher.evaluation({ action: 'LOCK', evaluationId: ids.evaluation, expectedVersion: 2 });
    await fail(clients.teacher.grades({ evaluationId: ids.evaluation, requestId: `locked-${token}`, rows: [{ studentId: ids.studentMax, resultStatus: 'scored', score: 19, expectedVersion: 1 }] }), 'failed-precondition', 'EVALUATION_NOT_OPEN');
    await fail(clients.teacher.evaluation({ action: 'PUBLISH', evaluationId: ids.evaluation, expectedVersion: 3 }), 'permission-denied', 'PERMISSION_DENIED');
    await clients.owner.evaluation({ action: 'PUBLISH', evaluationId: ids.evaluation, expectedVersion: 3 });
    assert.equal((await db.collection('evaluations').doc(ids.evaluation).get()).data().status, 'published');
    assert.equal((await db.collection('reportCards').where('testRunId', '==', testRunId).get()).size, 0);

    const cancelledCreate = await clients.teacher.evaluation({ ...create, evaluationId: ids.cancelledEvaluation, profile: { ...profile, title: 'À annuler' } });
    await clients.teacher.evaluation({ action: 'CANCEL', evaluationId: ids.cancelledEvaluation, expectedVersion: cancelledCreate.data.evaluation.version });
    assert.equal((await db.collection('evaluations').doc(ids.cancelledEvaluation).get()).data().status, 'cancelled');
    await assert.rejects(setDoc(doc(clients.owner.firestore, 'evaluations', `direct-${token}`), { schoolId: ids.school, ...fixture }));
    await assert.rejects(updateDoc(doc(clients.owner.firestore, 'evaluations', ids.evaluation), { status: 'open' }));
    await assert.rejects(deleteDoc(doc(clients.owner.firestore, 'evaluations', ids.evaluation)));
    await assert.rejects(setDoc(doc(clients.owner.firestore, 'grades', `direct-${token}`), { schoolId: ids.school, ...fixture }));
    await assert.rejects(updateDoc(doc(clients.owner.firestore, 'grades', gradeDocs[0].id), { score: 7 }));
    await assert.rejects(deleteDoc(doc(clients.owner.firestore, 'grades', gradeDocs[0].id)));
    assert.equal((await getDoc(doc(clients.secretary.firestore, 'evaluations', ids.evaluation))).data().status, 'published');
    await assert.rejects(getDoc(doc(clients.secretary.firestore, 'grades', gradeDocs[0].id)));
    await assert.rejects(getDocs(query(collection(clients.boardViewer.firestore, 'grades'), where('schoolId', '==', ids.school))));

    const audits = (await db.collection('audit_logs').where('testRunId', '==', testRunId).get()).docs.map(item => item.data());
    const actions = new Set(audits.map(item => item.action));
    for (const action of ['EVALUATION_CREATED', 'EVALUATION_OPENED', 'GRADE_RECORDED', 'GRADE_CORRECTED', 'EVALUATION_LOCKED', 'EVALUATION_PUBLISHED', 'EVALUATION_CANCELLED']) assert.ok(actions.has(action), action);
    assert.ok(audits.every(item => item.canonicalBackendAudit === true));
    assert.ok(audits.every(item => !/email|password|name|phone|address|payment|receipt/i.test(JSON.stringify(item.details || {}))));

    for (const viewport of [{ width: 360, height: 800 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport }); contexts.push(context);
      const page = await context.newPage();
      await page.route(`${appUrl}/**`, route => route.continue({ headers: { ...route.request().headers(),
        'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' } }));
      await page.goto(`${appUrl}/#/login`, { waitUntil: 'domcontentloaded' });
      assertProtectedPreviewLoaded({ expectedOrigin: appUrl, actualUrl: page.url() });
      await page.getByTestId('login-email').fill(profiles.emptyOwner.email);
      await page.getByTestId('login-password').fill(password); await page.getByTestId('login-submit').click();
      await page.waitForURL(url => !url.hash.includes('/login'), { timeout: 60_000 });
      await page.goto(`${appUrl}/#/grades`, { waitUntil: 'domcontentloaded' });
      const configurationRequired = page.getByTestId('grades-configuration-required');
      await configurationRequired.waitFor({ timeout: 30_000 });
      await configurationRequired.getByText('CONFIGURATION PÉDAGOGIQUE REQUISE').waitFor();
      await configurationRequired.getByText(/^Aucune période ouverte\.?$/i).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Saisir des Notes' }).isDisabled(), true);
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 2);
    }
    console.log(`ITALO-W2-04 GRADES STAGING E2E PASS ${testRunId} NaNRejection=${nanRejectionLayer} InfinityRejection=${infinityRejectionLayer} nonFiniteGradeWrites=0`);
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    for (const app of clientApps) await deleteApp(app).catch(() => undefined);
    const collections = ['gradeBatchRequests', 'grades', 'evaluations', 'reportCards', 'audit_logs', 'teacherAssignments',
      'staffUserLinkByUser', 'staffUserLinkByStaff', 'staffUserLinks', 'students', 'classSubjects', 'classPrograms',
      'staff', 'subjects', 'classes', 'periods', 'academicYears', 'users', 'schools'];
    for (const name of collections) {
      const snapshot = await db.collection(name).where('testRunId', '==', testRunId).get(); fixturesCreated += snapshot.size;
      for (const document of snapshot.docs) await document.ref.delete();
    }
    for (const uid of authUids) await adminAuth.deleteUser(uid).catch(() => undefined);
    for (const name of collections) assert.equal((await db.collection(name).where('testRunId', '==', testRunId).get()).size, 0, `${name} residuals`);
    for (const uid of authUids) await assert.rejects(adminAuth.getUser(uid), error => error?.code === 'auth/user-not-found');
    console.log(`ITALO-W2-04 GRADES STAGING CLEANUP PASS ${testRunId} fixturesCreated=${fixturesCreated} fixturesRemoved=${fixturesCreated} firestoreResiduals=0 authResiduals=0 productionWrites=0 productionDeletes=0 reportCardsCreated=0`);
    await deleteAdminApp(adminApp);
  }
}

run().catch(error => { console.error(error); process.exit(1); });