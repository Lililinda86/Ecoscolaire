const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required; never run against live data.');
const admin = require('../../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: 'demo-ecoscolaire' });
const { recordPedagogyObservations } = require('../../functions/lib/pedagogy/observations');
const { savePedagogyClassPolicy } = require('../../functions/lib/pedagogy/classPolicies');
const { defaultPedagogyPolicy } = require('../../functions/lib/pedagogy/pedagogyPolicy');
const { reviewChecksum } = require('../../functions/lib/pedagogy/teachingEvidence');
const { ensureWeeklyAssessmentDraft, generateWeeklyAssessment } = require('../../functions/lib/pedagogy/weeklyAssessments');
const db = admin.firestore(), schoolId = `obs-${randomUUID()}`;
const academicYearId = `${schoolId}-year`, classId = `${schoolId}-class`, preparationId = `${schoolId}-prep`, teacherStaffId = `${schoolId}-staff`, weekId = `${schoolId}-week`;
const scope = { schoolId, academicYearId, classId }, manifest = new Set();
const put = async (collection, id, data) => { const path = `${collection}/${id}`; manifest.add(path); await db.doc(path).create(data); };
const context = role => ({ auth: { uid: `${schoolId}-${role}`, token: {} } });
const denied = (promise, code) => assert.rejects(promise, error => error.code === code);
(async () => {
  try {
    await put('schools', schoolId, { name: 'Synthetic nursery fixture' });
    await put('classes', classId, { schoolId, name: 'Nursery 1', isActive: true, type: 'anglophone' });
    await put('academicYears', academicYearId, { schoolId, status: 'active', startDate: '2026-08-01', endDate: '2027-07-31' });
    await put('teachingWeeks', weekId, { schoolId, academicYearId, weekStartDate: '2026-08-31', weekEndDate: '2026-09-04', status: 'open' });
    await put('staff', teacherStaffId, { schoolId, role: 'teacher', active: true });
    // Existing assignments can predate the status field. Explicit isActive is accepted, draft is not.
    await put('teacherAssignments', `${schoolId}-assignment`, { ...scope, subjectId: 'language', teacherStaffId, isActive: true });
    for (const role of ['secretary', 'director', 'boardViewer', 'teacher']) await put('users', `${schoolId}-${role}`, { schoolId, role, isActive: true });
    const studentId = `${schoolId}-student`;
    await put('students', studentId, { ...scope, name: 'Synthetic pupil', isActive: true });
    const prep = { ...scope, weekId, subjectId: 'language', subjectName: 'Language', status: 'validated', currentUploadId: 'synthetic-upload', version: 3, reviewData: { lessonTitle: 'Naming shapes', objective: 'Name a circle', lessonSteps: 'Name a circle. Point to a square.' } };
    prep.teachingConfirmation = { id: 'synthetic-confirmation', status: 'taught', effectiveDate: '2026-09-01', reviewChecksum: reviewChecksum(prep), declaredByTeacherStaffId: teacherStaffId };
    await put('lessonPreparations', preparationId, prep);
    await denied(ensureWeeklyAssessmentDraft.run({ ...scope, weekId }, context('secretary')), 'failed-precondition');
    await denied(generateWeeklyAssessment.run({ ...scope, weekId }, context('secretary')), 'failed-precondition');
    const policy = defaultPedagogyPolicy({ name: 'Nursery 1', type: 'anglophone' });
    await denied(savePedagogyClassPolicy.run({ ...scope, expectedVersion: 0, policy }, context('secretary')), 'permission-denied');
    await denied(savePedagogyClassPolicy.run({ ...scope, expectedVersion: 0, policy: { ...policy, totalPoints: 20, assessmentMode: 'numeric' } }, context('director')), 'invalid-argument');
    const saved = await savePedagogyClassPolicy.run({ ...scope, expectedVersion: 0, policy }, context('director'));
    manifest.add(`pedagogyClassPolicies/${saved.policyId}`); manifest.add(`pedagogyClassPolicies/${saved.policyId}/versions/1`);
    await denied(savePedagogyClassPolicy.run({ ...scope, expectedVersion: 0, policy }, context('director')), 'aborted');
    const payload = { ...scope, preparationId, teacherStaffId, date: '2026-09-02', objective: 'Name a circle', declarationReceived: true, requestId: 'first', rows: [{ studentId, state: 'not_observed', comment: 'Activity not observed; no failure inferred.' }] };
    for (const role of ['teacher', 'boardViewer']) await denied(recordPedagogyObservations.run(payload, context(role)), 'permission-denied');
    await denied(recordPedagogyObservations.run({ ...payload, declarationReceived: false }, context('secretary')), 'failed-precondition');
    await denied(recordPedagogyObservations.run({ ...payload, objective: 'Invented objective' }, context('secretary')), 'failed-precondition');
    await denied(recordPedagogyObservations.run({ ...payload, date: '2026-08-01' }, context('secretary')), 'invalid-argument');
    const results = await Promise.all([recordPedagogyObservations.run(payload, context('secretary')), recordPedagogyObservations.run(payload, context('secretary'))]);
    assert.equal(results.filter(result => result.idempotent).length, 1);
    const id = results[0].observationIds[0], observation = (await db.doc(`pedagogyObservations/${id}`).get()).data();
    assert.equal(observation.state, 'not_observed'); assert.equal(observation.competencyId, null); assert.equal(observation.policySnapshot.totalPoints, null); assert.equal(observation.score, undefined);
    assert.equal(observation.declaredByTeacherStaffId, teacherStaffId); assert.equal(observation.recordedBy, `${schoolId}-secretary`);
    await denied(recordPedagogyObservations.run({ ...payload, rows: [{ ...payload.rows[0], state: 'acquired' }] }, context('secretary')), 'already-exists');
    const correction = await recordPedagogyObservations.run({ ...payload, requestId: 'correction', rows: [{ ...payload.rows[0], state: 'developing', supersedesId: id, comment: 'Teacher rectified the observation after reviewing the paper.' }] }, context('secretary'));
    assert.equal((await db.doc(`pedagogyObservations/${id}`).get()).data().supersededBy, correction.observationIds[0]);
    await denied(recordPedagogyObservations.run({ ...payload, requestId: 'second-correction', rows: [{ ...payload.rows[0], supersedesId: id }] }, context('secretary')), 'failed-precondition');
    await db.doc(`students/${studentId}`).update({ schoolId: 'another-school' });
    await denied(recordPedagogyObservations.run({ ...payload, requestId: 'cross-school' }, context('secretary')), 'permission-denied');
    console.log('PEDAGOGY_OBSERVATIONS_FUNCTIONS: PASS; numeric preschool denied, roles, idempotence, provenance, correction, pupil scope');
  } finally {
    for (const collection of ['pedagogyObservations', 'pedagogyObservationBatches', 'audit_logs']) {
      const documents = await db.collection(collection).where('schoolId', '==', schoolId).get(); documents.forEach(doc => manifest.add(doc.ref.path));
    }
    const batch = db.batch(); for (const path of manifest) batch.delete(db.doc(path)); await batch.commit();
    assert.ok((await Promise.all([...manifest].map(path => db.doc(path).get()))).every(doc => !doc.exists));
    await admin.app().delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
