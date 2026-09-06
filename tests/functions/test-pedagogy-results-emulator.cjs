const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required.');
const admin = require('../../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: 'demo-ecoscolaire' });
const { seedResultsFixture } = require('../helpers/pedagogy-results-fixture.cjs');
const { publishPedagogyAssessmentToGrades, recordPedagogyResults } = require('../../functions/lib/pedagogy/canonicalResults');
const { recordGradesBatch, manageEvaluation } = require('../../functions/lib/academic/manageGrades');
const { normalizeCanonicalGrade } = require('../../functions/lib/academic/canonicalGradeCalculations');
const db = admin.firestore();
(async () => {
  const f = await seedResultsFixture(db, `pedagogy-results-${randomBytes(8).toString('hex')}`);
  const context = { auth: { uid: f.secretaryId, token: {} } };
  try {
    const transfer = { schoolId: f.schoolId, assessmentId: f.assessmentId, periodId: f.periodId, date: '2026-09-04', confirmTransfer: true, generationVersion: 1, contentRevision: 0, sourceChecksum: 'synthetic-source-checksum' };
    await assert.rejects(publishPedagogyAssessmentToGrades.run({ ...transfer, confirmTransfer: false }, context), error => error.code === 'invalid-argument');
    const [first, duplicate] = await Promise.all([publishPedagogyAssessmentToGrades.run(transfer, context), publishPedagogyAssessmentToGrades.run(transfer, context)]);
    assert.equal(first.evaluationIds.length, 2); assert.deepEqual(first.evaluationIds, duplicate.evaluationIds);
    assert.equal(Number(first.idempotent) + Number(duplicate.idempotent), 1);
    const evaluationId = first.evaluationIds[0];
    const evaluation = (await db.doc(`evaluations/${evaluationId}`).get()).data();
    assert.equal(evaluation.maxScore, 10); assert.equal(evaluation.teacherUserId, null);
    assert.equal((await db.collection('grades').where('schoolId', '==', f.schoolId).get()).size, 0, 'transfer creates no pupil results');
    const rows = [
      { studentId: f.pupilIds[0], resultStatus: 'scored', score: 0, expectedVersion: 0 },
      { studentId: f.pupilIds[1], resultStatus: 'absent', expectedVersion: 0 },
      { studentId: f.pupilIds[2], resultStatus: 'notEvaluated', expectedVersion: 0 },
      { studentId: f.pupilIds[3], resultStatus: 'notSubmitted', expectedVersion: 0 }
    ];
    const input = { schoolId: f.schoolId, evaluationId, requestId: 'synthetic-batch', expectedEvaluationVersion: 1, teacherStaffId: f.teacherId, correctionDate: '2026-09-04', correctionReceived: true, rows };
    await assert.rejects(recordGradesBatch.run({ schoolId: f.schoolId, evaluationId, requestId: 'generic', rows }, context), error => error.code === 'permission-denied');
    await assert.rejects(manageEvaluation.run({ action: 'OPEN', schoolId: f.schoolId, evaluationId, expectedVersion: 1 }, context), error => error.code === 'permission-denied');
    await assert.rejects(manageEvaluation.run({ action: 'CREATE_DRAFT', schoolId: f.schoolId, evaluationId: `${f.schoolId}-generic`, academicYearId: f.academicYearId, periodId: f.periodId, classId: f.classId, subjectId: `${f.schoolId}-math`, teacherAssignmentId: `${f.schoolId}-assignment-math`, profile: { title: 'Synthetic generic evaluation', type: 'test', date: '2026-09-04', maxScore: 10, weight: 1 } }, { auth: { uid: f.directorId, token: {} } }), error => error.code === 'invalid-argument');
    await assert.rejects(publishPedagogyAssessmentToGrades.run({ ...transfer, schoolId: `${f.schoolId}-other` }, context), error => error.code === 'permission-denied');
    await assert.rejects(recordPedagogyResults.run({ ...input, correctionReceived: false }, context), error => error.code === 'failed-precondition');
    await assert.rejects(recordPedagogyResults.run({ ...input, rows: [{ ...rows[1], score: 0 }] }, context), error => error.code === 'invalid-argument');
    const saves = await Promise.all([recordPedagogyResults.run(input, context), recordPedagogyResults.run(input, context)]);
    assert.equal(Number(saves[0].idempotent) + Number(saves[1].idempotent), 1);
    const grades = await db.collection('grades').where('schoolId', '==', f.schoolId).get();
    assert.equal(grades.size, 4);
    const zero = grades.docs.find(item => item.data().studentId === f.pupilIds[0]).data();
    assert.equal(zero.score, 0);
    assert.equal(normalizeCanonicalGrade({ evaluationId, resultStatus: zero.resultStatus, score: zero.score, maxScore: 10 }).calculable, true);
    for (const grade of grades.docs.filter(item => item.data().studentId !== f.pupilIds[0]).map(item => item.data())) {
      assert.equal(grade.score, undefined);
      assert.equal(normalizeCanonicalGrade({ evaluationId, resultStatus: grade.resultStatus, maxScore: 10 }).calculable, false);
    }
    assert.ok(!grades.docs.some(item => item.data().studentId === f.pupilIds[4]), 'missing pupil result stays absent, not zero');
    await db.doc(`students/${f.pupilIds[4]}`).update({ classId: 'synthetic-other-class' });
    await assert.rejects(recordPedagogyResults.run({ ...input, requestId: 'wrong-class', rows: [{ studentId: f.pupilIds[4], resultStatus: 'scored', score: 5, expectedVersion: 0 }] }, context), error => error.code === 'permission-denied');
    await assert.rejects(recordPedagogyResults.run({ ...input, requestId: 'stale' }, context), error => error.code === 'aborted');
    await recordPedagogyResults.run({ ...input, requestId: 'correction', rows: [{ ...rows[0], score: 7, expectedVersion: 1 }] }, context);
    const corrected = grades.docs.find(item => item.data().studentId === f.pupilIds[0]).ref;
    assert.equal((await corrected.get()).data().score, 7);
    assert.equal((await corrected.collection('pedagogyHistory').get()).size, 2);
    // Historical published test data remains usable even after the preparation
    // editor moves on to a new draft; the immutable transferred version is used.
    await db.doc(`weeklyAssessments/${f.assessmentId}`).update({ status: 'needs_review', contentRevision: 1, teacherValidated: false });
    await recordPedagogyResults.run({ ...input, requestId: 'historical', rows: [{ ...rows[1], resultStatus: 'notEvaluated', expectedVersion: 1 }] }, context);
    console.log('PEDAGOGY_RESULTS_EMULATOR: PASS; canonical evaluations/grades written intentionally; no parallel numeric registry; offline teacher, idempotency, zero/non-score distinction and history');
  } finally { await f.cleanup(); await admin.app().delete(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
