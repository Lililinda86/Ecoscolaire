const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('This test requires the Firestore emulator.');
const admin = require('../../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: 'demo-ecoscolaire' });
const { recordTeachingConfirmations } = require('../../functions/lib/pedagogy/teachingConfirmations');
const { readWeeklyAssessmentSources } = require('../../functions/lib/pedagogy/weeklyAssessments');
const db = admin.firestore();
const prefix = `teaching-${randomUUID()}`;
const schoolId = prefix, academicYearId = `${prefix}-year`, classId = `${prefix}-class`, weekId = `${prefix}-week`, teacherId = `${prefix}-teacher`;
const owned = { schoolId, academicYearId, classId, weekId };
const manifest = new Set();
const put = async (collection, id, data) => { const path = `${collection}/${id}`; manifest.add(path); await db.doc(path).create(data); };
const context = uid => ({ auth: { uid, token: {} } });
const expectCode = (operation, code) => assert.rejects(operation, error => error.code === code);
(async () => {
  try {
    await put('schools', schoolId, { name: 'Teaching fixture', schoolId });
    await put('academicYears', academicYearId, { schoolId, status: 'active', startDate: '2026-08-01', endDate: '2027-07-31' });
    await put('classes', classId, { schoolId, name: 'CE1', isActive: true });
    await put('teachingWeeks', weekId, { schoolId, academicYearId, weekStartDate: '2026-08-31', weekEndDate: '2026-09-04', status: 'open' });
    await put('staff', teacherId, { schoolId, role: 'teacher', isActive: true });
    await put('teacherAssignments', `${prefix}-assignment`, { schoolId, academicYearId, classId, subjectId: 'math', teacherStaffId: teacherId, status: 'active', isActive: true });
    for (const [suffix, role, tenant] of [['secretary', 'secretary', schoolId], ['director', 'director', schoolId], ['board', 'boardViewer', schoolId], ['teacher-user', 'teacher', schoolId], ['other', 'secretary', 'other-school']]) await put('users', `${prefix}-${suffix}`, { schoolId: tenant, role, isActive: true });
    const prepId = `${prefix}-prep`;
    await put('lessonPreparations', prepId, { ...owned, subjectId: 'math', subjectName: 'Mathématiques', status: 'validated', version: 2, teacherStaffId: teacherId, currentUploadId: 'fixture-upload', reviewData: { lessonTitle: 'Fractions', objective: 'Partager', lessonSteps: 'Partager une unité. Comparer les fractions.' } });
    const sourceBefore = await readWeeklyAssessmentSources(owned, schoolId);
    assert.equal(sourceBefore.validated.length, 0, 'reviewed does not imply taught');
    const input = { ...owned, requestId: 'first', declarations: [{ preparationId: prepId, teacherStaffId: teacherId, expectedVersion: 2, status: 'partially_taught', effectiveDate: '2026-09-02', excerpts: ['Partager une unité.'], note: 'Synthetic teacher declaration' }] };
    for (const role of ['board', 'teacher-user', 'other']) await expectCode(recordTeachingConfirmations.run(input, context(`${prefix}-${role}`)), 'permission-denied');
    await expectCode(recordTeachingConfirmations.run(input, {}), 'unauthenticated');
    const [one, two] = await Promise.all([recordTeachingConfirmations.run(input, context(`${prefix}-secretary`)), recordTeachingConfirmations.run(input, context(`${prefix}-secretary`))]);
    assert.equal(one.recordedCount, 1); assert.equal(two.recordedCount, 1); assert.equal(Number(one.idempotent) + Number(two.idempotent), 1);
    const updated = (await db.collection('lessonPreparations').doc(prepId).get()).data();
    assert.equal(updated.version, 3);
    assert.equal(updated.teachingConfirmation.recordedBy, `${prefix}-secretary`);
    assert.equal(updated.teachingConfirmation.declaredByTeacherStaffId, teacherId);
    assert.ok(updated.teachingConfirmation.recordedAt.toDate() instanceof Date);
    const sources = await readWeeklyAssessmentSources(owned, schoolId);
    assert.equal(sources.validated.length, 1); assert.equal(sources.validated[0].pedagogicalContent, 'Partager une unité.');
    assert.equal(sources.validated[0].objective, null, 'broad objective excluded from partial teaching');
    assert.ok(!JSON.stringify(sources.validated).includes('Comparer'));
    await expectCode(recordTeachingConfirmations.run({ ...input, declarations: [{ ...input.declarations[0], note: 'changed' }] }, context(`${prefix}-secretary`)), 'already-exists');
    await expectCode(recordTeachingConfirmations.run({ ...input, requestId: 'stale' }, context(`${prefix}-secretary`)), 'aborted');
    await put('staff', `${prefix}-outsider`, { schoolId, role: 'teacher', isActive: true });
    await expectCode(recordTeachingConfirmations.run({ ...input, requestId: 'spoof', declarations: [{ ...input.declarations[0], teacherStaffId: `${prefix}-outsider`, expectedVersion: 3 }] }, context(`${prefix}-director`)), 'permission-denied');
    await expectCode(recordTeachingConfirmations.run({ ...input, requestId: 'invented', declarations: [{ ...input.declarations[0], expectedVersion: 3, excerpts: ['Unrelated content'] }] }, context(`${prefix}-secretary`)), 'invalid-argument');
    await recordTeachingConfirmations.run({ ...input, requestId: 'corrected', declarations: [{ ...input.declarations[0], expectedVersion: 3, status: 'not_taught' }] }, context(`${prefix}-secretary`));
    assert.equal((await readWeeklyAssessmentSources(owned, schoolId)).validated.length, 0);
    assert.equal((await db.collection('teachingConfirmations').where('schoolId', '==', schoolId).get()).size, 2, 'history preserved');
    await db.doc(`teachingWeeks/${weekId}`).update({ academicYearId: 'other-year' });
    await expectCode(readWeeklyAssessmentSources(owned, schoolId), 'failed-precondition');
    console.log('TEACHING_CONFIRMATION_FUNCTIONS: PASS; concurrency, scope, spoofing, portions, history');
  } finally {
    for (const collection of ['teachingConfirmations', 'teachingConfirmationBatches', 'audit_logs']) {
      const docs = await db.collection(collection).where('schoolId', '==', schoolId).get(); docs.forEach(doc => manifest.add(doc.ref.path));
    }
    const batch = db.batch(); for (const path of manifest) batch.delete(db.doc(path)); await batch.commit();
    assert.ok((await Promise.all([...manifest].map(path => db.doc(path).get()))).every(doc => !doc.exists));
    await admin.app().delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
