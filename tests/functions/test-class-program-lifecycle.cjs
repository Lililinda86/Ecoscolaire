const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalRequire = Module.prototype.require;

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST est obligatoire.');
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (projectId !== 'demo-school') throw new Error(`Projet émulateur interdit: ${projectId || 'absent'}`);
const adminPath = path.resolve(__dirname, '../../functions/node_modules/firebase-admin');
Module.prototype.require = function patchedRequire() {
  const name = arguments[0];
  if (name === 'firebase-admin') return originalRequire.call(this, adminPath);
  if (name === 'firebase-admin/firestore') return originalRequire.call(this, path.join(adminPath, 'lib/firestore'));
  return originalRequire.apply(this, arguments);
};

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
const { ensureClassProgramDraft } = require('../../functions/lib/academic/ensureClassProgramDraft.js');
const { updateClassProgramDraft } = require('../../functions/lib/academic/updateClassProgramDraft.js');
const { publishClassProgramDraft } = require('../../functions/lib/academic/publishClassProgramDraft.js');
const { archiveClassProgram } = require('../../functions/lib/academic/archiveClassProgram.js');
const { computeDraftStateToken } = require('../../functions/lib/academic/draftStateToken.js');

const runId = 'ITALO-W2-02-LOCAL';
const schoolId = 'program-school-a';
const otherSchoolId = 'program-school-b';
const yearId = 'program-year-zero-period';
const classId = 'program-class-a';
const programId = `${schoolId}__2030-2031__${classId}`;
const revisionId = `${programId}__v1`;
const ctx = uid => ({ auth: { uid } });
const expectCode = async (promise, businessCode) => {
  try { await promise; assert.fail(`Erreur ${businessCode} attendue`); }
  catch (error) { assert.strictEqual(error.details?.businessCode, businessCode, error.message); }
};

async function cleanup() {
  for (const collection of ['audit_logs', 'classSubjects', 'classPrograms', 'periods', 'subjects', 'classes', 'academicYears', 'users']) {
    const snapshot = await db.collection(collection).where('testRunId', '==', runId).get();
    await Promise.all(snapshot.docs.map(document => document.ref.delete()));
  }
}

async function run() {
  await cleanup();
  try {
    await Promise.all([
      db.collection('users').doc('program-owner').set({ role: 'owner', schoolId, isActive: true, testFixture: true, testRunId: runId }),
      db.collection('users').doc('program-director').set({ role: 'director', schoolId, isActive: true, testFixture: true, testRunId: runId }),
      db.collection('users').doc('program-secretary').set({ role: 'secretary', schoolId, isActive: true, testFixture: true, testRunId: runId }),
      db.collection('users').doc('program-teacher').set({ role: 'teacher', schoolId, isActive: true, testFixture: true, testRunId: runId }),
      db.collection('users').doc('program-other-owner').set({ role: 'owner', schoolId: otherSchoolId, isActive: true, testFixture: true, testRunId: runId }),
      db.collection('academicYears').doc(yearId).set({ id: yearId, name: '2030-2031', schoolId, status: 'active', testFixture: true, testRunId: runId }),
      db.collection('classes').doc(classId).set({ id: classId, name: 'Classe fixture', schoolId, isActive: true, testFixture: true, testRunId: runId }),
      db.collection('classes').doc('program-class-director').set({ id: 'program-class-director', name: 'Classe director', schoolId, isActive: true, testFixture: true, testRunId: runId }),
      db.collection('subjects').doc('program-subject-a').set({ id: 'program-subject-a', name: 'Matière A', schoolId, isActive: true, testFixture: true, testRunId: runId }),
      db.collection('subjects').doc('program-subject-b').set({ id: 'program-subject-b', name: 'Matière B', schoolId, isActive: true, testFixture: true, testRunId: runId }),
      db.collection('subjects').doc('program-subject-inactive').set({ id: 'program-subject-inactive', name: 'Inactive', schoolId, isActive: false, testFixture: true, testRunId: runId }),
      db.collection('subjects').doc('program-subject-cross').set({ id: 'program-subject-cross', name: 'Cross', schoolId: otherSchoolId, isActive: true, testFixture: true, testRunId: runId }),
    ]);

    const ensurePayload = { schoolId, academicYearId: yearId, classId };
    await expectCode(ensureClassProgramDraft.run(ensurePayload, ctx('program-secretary')), 'PERMISSION_DENIED');
    await expectCode(ensureClassProgramDraft.run(ensurePayload, ctx('program-teacher')), 'PERMISSION_DENIED');
    await expectCode(ensureClassProgramDraft.run(ensurePayload, ctx('program-other-owner')), 'PERMISSION_DENIED');
    await expectCode(ensureClassProgramDraft.run({ ...ensurePayload, classId: 'missing-class' }, ctx('program-owner')), 'CLASS_NOT_FOUND');
    await expectCode(ensureClassProgramDraft.run({ ...ensurePayload, academicYearId: 'missing-year' }, ctx('program-owner')), 'ACADEMIC_YEAR_NOT_FOUND');

    const created = await ensureClassProgramDraft.run(ensurePayload, ctx('program-owner'));
    assert.strictEqual(created.programId, programId);
    assert.strictEqual(created.draftRevisionId, revisionId);
    const directorCreated = await ensureClassProgramDraft.run({ ...ensurePayload, classId: 'program-class-director' }, ctx('program-director'));
    assert.strictEqual(directorCreated.created, true);
    assert.strictEqual((await db.collection('periods').where('academicYearId', '==', yearId).get()).size, 0);

    const baseUpdate = { schoolId, academicYearId: yearId, classId, expectedDraftRevisionId: revisionId };
    await updateClassProgramDraft.run({ ...baseUpdate, subjects: [] }, ctx('program-director'));
    await expectCode(publishClassProgramDraft.run({ ...ensurePayload, expectedDraftRevisionId: revisionId, expectedDraftStateToken: computeDraftStateToken([]) }, ctx('program-owner')), 'PROGRAM_NOT_READY');
    await expectCode(updateClassProgramDraft.run({ ...baseUpdate, subjects: [
      { subjectId: 'program-subject-a', coefficient: 2, weeklyHours: 3, isRequired: true, isActive: true, displayOrder: 0 },
      { subjectId: 'program-subject-a', coefficient: 2, weeklyHours: 3, isRequired: true, isActive: true, displayOrder: 1 },
    ] }, ctx('program-owner')), 'DUPLICATE_SUBJECT');
    await expectCode(updateClassProgramDraft.run({ ...baseUpdate, subjects: [
      { subjectId: 'program-subject-inactive', coefficient: 2, weeklyHours: 3, isRequired: true, isActive: true, displayOrder: 0 },
    ] }, ctx('program-owner')), 'SUBJECT_NOT_ACTIVE');
    await expectCode(updateClassProgramDraft.run({ ...baseUpdate, subjects: [
      { subjectId: 'program-subject-cross', coefficient: 2, weeklyHours: 3, isRequired: true, isActive: true, displayOrder: 0 },
    ] }, ctx('program-owner')), 'SCHOOL_MISMATCH');
    await expectCode(updateClassProgramDraft.run({ ...baseUpdate, subjects: [
      { subjectId: 'program-subject-a', coefficient: 101, weeklyHours: 3, isRequired: true, isActive: true, displayOrder: 0 },
    ] }, ctx('program-owner')), 'INVALID_CONFIGURATION');
    await expectCode(updateClassProgramDraft.run({ ...baseUpdate, subjects: [] }, ctx('program-secretary')), 'PERMISSION_DENIED');
    await expectCode(updateClassProgramDraft.run({ ...baseUpdate, subjects: [] }, ctx('program-teacher')), 'PERMISSION_DENIED');

    await updateClassProgramDraft.run({ ...baseUpdate, subjects: [
      { subjectId: 'program-subject-a', coefficient: 2, weeklyHours: 3, isRequired: true, isActive: true, displayOrder: 0 },
      { subjectId: 'program-subject-b', coefficient: 1, weeklyHours: 2, isRequired: false, isActive: true, displayOrder: 1 },
    ] }, ctx('program-owner'));
    const subjectSnapshot = await db.collection('classSubjects').where('programId', '==', programId).where('revisionId', '==', revisionId).get();
    assert.strictEqual(subjectSnapshot.size, 2);
    const token = computeDraftStateToken(subjectSnapshot.docs.map(document => document.data()));
    const publicationPayload = { ...ensurePayload, expectedDraftRevisionId: revisionId, expectedDraftStateToken: token };
    await db.collection('subjects').doc('program-subject-b').update({ isActive: false });
    await expectCode(publishClassProgramDraft.run(publicationPayload, ctx('program-owner')), 'SUBJECT_NOT_ACTIVE');
    await db.collection('subjects').doc('program-subject-b').update({ isActive: true });
    const results = await Promise.allSettled([
      publishClassProgramDraft.run(publicationPayload, ctx('program-owner')),
      publishClassProgramDraft.run(publicationPayload, ctx('program-director')),
    ]);
    assert.strictEqual(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.strictEqual(results.filter(result => result.status === 'rejected').length, 1);
    assert.strictEqual(results.find(result => result.status === 'rejected').reason.details?.businessCode, 'PROGRAM_ALREADY_PUBLISHED');
    const published = (await db.collection('classPrograms').doc(programId).get()).data();
    assert.strictEqual(published.status, 'published');
    assert.strictEqual(published.publishedRevisionId, revisionId);
    await expectCode(updateClassProgramDraft.run({ ...baseUpdate, subjects: [] }, ctx('program-owner')), 'DRAFT_CHANGED');

    const archived = await archiveClassProgram.run({ ...ensurePayload, expectedPublishedRevisionId: revisionId }, ctx('program-director'));
    assert.strictEqual(archived.status, 'archived');
    assert.strictEqual((await db.collection('classSubjects').where('programId', '==', programId).get()).size, 2);
    const audits = await db.collection('audit_logs').where('testRunId', '==', runId).get();
    const actions = audits.docs.map(document => document.data().action);
    for (const action of ['CLASS_PROGRAM_CREATED', 'CLASS_PROGRAM_UPDATED', 'CLASS_PROGRAM_PUBLISHED', 'CLASS_PROGRAM_ARCHIVED']) assert.ok(actions.includes(action));
    assert.ok(audits.docs.every(document => document.data().canonicalBackendAudit === true && !('email' in document.data())));
    console.log('Class program canonical lifecycle, RBAC, zero-period publication and concurrency: PASS');
  } finally {
    await cleanup();
    const residuals = await Promise.all(['audit_logs', 'classSubjects', 'classPrograms', 'periods', 'subjects', 'classes', 'academicYears', 'users'].map(collection => db.collection(collection).where('testRunId', '==', runId).get()));
    assert.strictEqual(residuals.reduce((count, snapshot) => count + snapshot.size, 0), 0);
  }
}

run().catch(error => { console.error(error); process.exit(1); });
