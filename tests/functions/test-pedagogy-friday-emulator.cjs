const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required.');
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.GCLOUD_PROJECT = 'demo-ecoscolaire';
const admin = require('../../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: 'demo-ecoscolaire' });
const { savePedagogyFridayConfiguration, runPedagogyFriday } = require('../../functions/lib/pedagogy/fridayAutomation');
const { reviewChecksum } = require('../../functions/lib/pedagogy/teachingEvidence');
const { recordWeeklyAssessmentTeacherValidation, markWeeklyAssessmentReadyToPrint, saveWeeklyAssessmentEdits } = require('../../functions/lib/pedagogy/weeklyAssessments');
const db = admin.firestore(), prefix = `friday-${randomBytes(8).toString('hex')}`;
const schoolId = prefix, academicYearId = `${prefix}-year`, classId = `${prefix}-class`, weekId = `${prefix}-week`;
const manifest = new Set();
const put = async (name, id, data) => { const path = `${name}/${id}`; manifest.add(path); await db.doc(path).create(data); };
const context = suffix => ({ auth: { uid: `${prefix}-${suffix}`, token: {} } });
const now = new Date('2026-09-04T09:00:00Z');
(async () => {
  try {
    await put('schools', schoolId, { name: 'Synthetic scheduler school', activeAcademicYearId: academicYearId });
    await put('academicYears', academicYearId, { schoolId, status: 'active', startDate: '2026-08-01', endDate: '2027-07-31' });
    await put('classes', classId, { schoolId, name: 'CE1', isActive: true });
    await put('teachingWeeks', weekId, { schoolId, academicYearId, status: 'open', weekStartDate: '2026-08-31', weekEndDate: '2026-09-04' });
    for (const role of ['director', 'secretary', 'boardViewer']) await put('users', `${prefix}-${role}`, { schoolId, role, isActive: true });
    await put('staff', `${prefix}-teacher`, { schoolId, role: 'teacher', isActive: true });
    await put('staff', `${prefix}-outsider`, { schoolId, role: 'teacher', isActive: true });
    await put('teacherAssignments', `${prefix}-assignment`, { schoolId, academicYearId, classId, subjectId: 'synthetic-math', teacherStaffId: `${prefix}-teacher`, status: 'active', isActive: true });
    const reviewData = { lessonTitle: 'Synthetic addition', objective: 'Additionner', lessonSteps: 'Compter puis additionner.' };
    await put('lessonPreparations', `${prefix}-prep`, { schoolId, academicYearId, classId, weekId, subjectId: 'synthetic-math', subjectName: 'Mathématiques', version: 1, status: 'validated', currentUploadId: 'synthetic-upload', reviewData,
      teachingConfirmation: { id: 'synthetic-declaration', status: 'taught', effectiveDate: '2026-09-02', declaredByTeacherStaffId: 'synthetic-teacher', recordedBy: `${prefix}-secretary`, reviewChecksum: reviewChecksum({ currentUploadId: 'synthetic-upload', reviewData }), excerpts: [] } });
    const input = { schoolId, academicYearId, expectedVersion: 0, policy: { enabled: true, localTime: '10:00', classIds: [classId] } };
    for (const role of ['secretary', 'boardViewer']) await assert.rejects(savePedagogyFridayConfiguration.run(input, context(role)), error => error.code === 'permission-denied');
    await savePedagogyFridayConfiguration.run(input, context('director'));
    await assert.rejects(savePedagogyFridayConfiguration.run(input, context('director')), error => error.code === 'aborted');
    const early = await runPedagogyFriday(new Date('2026-09-04T08:59:00Z'));
    assert.equal(early.attempts, 0);
    await db.doc(`teachingWeeks/${weekId}`).update({ status: 'closed' });
    assert.equal((await runPedagogyFriday(now)).attempts, 0);
    await db.doc(`teachingWeeks/${weekId}`).update({ status: 'open' });
    const parallel = await Promise.all([runPedagogyFriday(now), runPedagogyFriday(now)]);
    assert.equal(parallel.reduce((sum, result) => sum + result.attempts, 0), 1);
    const runs = await db.collection('pedagogyFridayRuns').where('schoolId', '==', schoolId).get();
    assert.equal(runs.size, 1); assert.equal(runs.docs[0].data().status, 'succeeded');
    const assessments = await db.collection('weeklyAssessments').where('schoolId', '==', schoolId).get();
    assert.equal(assessments.size, 1); assert.equal(assessments.docs[0].data().status, 'needs_review');
    assert.equal(assessments.docs[0].data().teacherValidated, false);
    assert.equal((await runPedagogyFriday(now)).attempts, 0, 'repeated trigger must not regenerate');
    // Simulate a worker crash after the business result was committed: an expired
    // run lease resumes via the same idempotent generation service, with no duplicate.
    await runs.docs[0].ref.update({ status: 'processing', leaseUntil: admin.firestore.Timestamp.fromMillis(0) });
    assert.equal((await runPedagogyFriday(now)).attempts, 1);
    assert.equal((await assessments.docs[0].ref.get()).data().generationVersion, 1);
    const assessment = (await assessments.docs[0].ref.get()).data();
    const version = { generationVersion: assessment.generationVersion, contentRevision: assessment.contentRevision || 0, sourceChecksum: assessment.sourceChecksum };
    const decision = { schoolId, assessmentId: assessments.docs[0].id, ...version, teacherStaffId: `${prefix}-teacher`, declarationReceived: true, note: 'Synthetic received decision', subjectId: 'synthetic-math' };
    await assert.rejects(recordWeeklyAssessmentTeacherValidation.run({ ...decision, declarationReceived: false }, context('secretary')), error => error.code === 'failed-precondition');
    await assert.rejects(recordWeeklyAssessmentTeacherValidation.run({ ...decision, teacherStaffId: `${prefix}-outsider` }, context('secretary')), error => error.code === 'permission-denied');
    await recordWeeklyAssessmentTeacherValidation.run(decision, context('secretary'));
    await markWeeklyAssessmentReadyToPrint.run(decision, context('secretary'));
    const items = (await db.collection('assessmentItems').where('schoolId', '==', schoolId).get()).docs.map(item => ({ ...item.data(), id: item.id, expectedAnswer: 'Synthetic corrected answer' }));
    await saveWeeklyAssessmentEdits.run({ ...decision, items }, context('secretary'));
    const corrected = (await assessments.docs[0].ref.get()).data();
    assert.equal(corrected.status, 'needs_review'); assert.equal(corrected.teacherValidated, false);
    assert.equal(corrected.contentRevision, 1); assert.deepEqual(corrected.teacherValidations, []);
    await assert.rejects(recordWeeklyAssessmentTeacherValidation.run(decision, context('secretary')), error => error.code === 'aborted');
    await db.doc(`lessonPreparations/${prefix}-prep`).update({ version: 2 });
    await assert.rejects(recordWeeklyAssessmentTeacherValidation.run({ ...decision, contentRevision: 1 }, context('secretary')), error => error.code === 'failed-precondition');
    await savePedagogyFridayConfiguration.run({ ...input, expectedVersion: 1, policy: { ...input.policy, enabled: false } }, context('director'));
    assert.equal((await runPedagogyFriday(now)).attempts, 0);
    console.log('FRIDAY_EMULATOR: PASS; actual business workflow with explicit emulator generator; not a real provider or deployed scheduler proof');
  } finally {
    for (const name of ['pedagogyFridayConfigurations', 'pedagogyFridayRuns', 'weeklyAssessments', 'assessmentItems', 'audit_logs']) {
      const documents = await db.collection(name).where('schoolId', '==', schoolId).get();
      for (const document of documents.docs) {
        manifest.add(document.ref.path);
        for (const nested of name === 'pedagogyFridayConfigurations' ? ['versions'] : name === 'weeklyAssessments' ? ['revisions', 'contentRevisions', 'teacherDecisions'] : []) {
          (await document.ref.collection(nested).get()).docs.forEach(item => manifest.add(item.ref.path));
        }
      }
    }
    const batch = db.batch(); [...manifest].forEach(path => batch.delete(db.doc(path))); await batch.commit();
    assert.ok((await Promise.all([...manifest].map(path => db.doc(path).get()))).every(item => !item.exists));
    await admin.app().delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
