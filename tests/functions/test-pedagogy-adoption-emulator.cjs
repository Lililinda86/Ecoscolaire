const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.GCLOUD_PROJECT = 'demo-ecoscolaire';
const admin = require('../../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: 'demo-ecoscolaire' });
const { adoptCurriculumProgram } = require('../../functions/lib/pedagogy/curriculumAdoption');
const { assertAiAssessmentReviewQuality } = require('../../functions/lib/pedagogy/assessmentQualityGate');
const db = admin.firestore(), prefix = 'adoption-' + randomBytes(8).toString('hex');
const schoolId = prefix, yearId = prefix + '-year', programId = prefix + '-program';
const ref = db.doc('schoolCurriculumAdoptions/' + schoolId + '__' + yearId + '__primary-1');
const context = role => ({ auth: { uid: prefix + '-' + role, token: {} } });
(async () => {
  try {
    for (const role of ['secretary', 'boardViewer', 'foreign']) await db.doc('users/' + prefix + '-' + role).create({ schoolId: role === 'foreign' ? 'another-school' : schoolId, role: role === 'foreign' ? 'secretary' : role, isActive: true });
    await db.doc('academicYears/' + yearId).create({ schoolId, status: 'active' });
    await db.doc('curriculumPrograms/' + programId).create({ status: 'published', version: 'synthetic-v1', sourceType: 'mock' });
    await db.doc('curriculumUnits/' + prefix).create({ programId, catalogLevelId: 'primary-1', status: 'published' });
    const input = { schoolId, academicYearId: yearId, catalogLevelId: 'primary-1', curriculumProgramId: programId,
      expectedRevision: 0, expectedProgramVersion: 'synthetic-v1', declarationReceived: true,
      decisionBy: 'Synthetic reviewer fixture', decisionDate: '2026-09-01', decisionReference: 'Synthetic emulator decision only, no real approval.' };
    for (const role of ['boardViewer', 'foreign']) await assert.rejects(adoptCurriculumProgram.run(input, context(role)), error => error.code === 'permission-denied');
    for (const replacement of [{ declarationReceived: false }, { decisionBy: '' }, { decisionDate: '2026-02-30' }, { decisionDate: '2999-01-01' }, { decisionReference: '' }]) {
      await assert.rejects(adoptCurriculumProgram.run({ ...input, ...replacement }, context('secretary')), error => error.code === 'invalid-argument');
    }
    await assert.rejects(adoptCurriculumProgram.run({ ...input, catalogLevelId: 'secondary-1' }, context('secretary')), error => error.code === 'failed-precondition');
    await assert.rejects(adoptCurriculumProgram.run({ ...input, expectedProgramVersion: 'stale' }, context('secretary')), error => error.code === 'aborted');
    // Preserve a pre-existing legacy adoption instead of manufacturing its decision.
    await ref.create({ schoolId, academicYearId: yearId, catalogLevelId: 'primary-1', curriculumProgramId: 'synthetic-legacy', status: 'active' });
    const results = await Promise.allSettled([adoptCurriculumProgram.run(input, context('secretary')), adoptCurriculumProgram.run(input, context('secretary'))]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'aborted').length, 1);
    const current = (await ref.get()).data();
    assert.equal(current.revision, 1); assert.equal(current.programVersion, 'synthetic-v1');
    assert.equal(current.decision.declaredBy, input.decisionBy);
    assert.equal(current.decision.recordedBy, prefix + '-secretary');
    assert.equal(current.sourceAuthentication, 'not_established_by_adoption');
    assert.equal((await ref.collection('versions').doc('0').get()).data().curriculumProgramId, 'synthetic-legacy');
    assert.equal((await ref.collection('versions').doc('0').get()).data().decision, undefined);
    assert.equal((await ref.collection('versions').get()).size, 2);
    await db.doc('curriculumPrograms/' + programId).update({ status: 'archived' });
    await assert.rejects(adoptCurriculumProgram.run({ ...input, expectedRevision: 1 }, context('secretary')), error => error.code === 'failed-precondition');
    assert.equal((await ref.get()).data().revision, 1);
    const qualityRef = db.doc('assessmentItems/' + prefix + '-quality');
    const qualityAssessment = { generatorProvider: 'openai', generationVersion: 1, itemCount: 1 };
    await qualityRef.create({ schoolId, weeklyAssessmentId: prefix + '-quality', generationVersion: 1, order: 1, questionType: 'multiple_choice', questionText: 'Synthetic choice missing', instructions: 'Choose.', expectedAnswer: 'A' });
    const checkQuality = () => db.runTransaction(transaction => assertAiAssessmentReviewQuality(transaction, qualityAssessment, schoolId, prefix + '-quality'));
    await assert.rejects(checkQuality(), error => error.code === 'failed-precondition');
    await qualityRef.update({ questionText: 'Synthetic choices: A) 2/4 B) 1/4' });
    await checkQuality();
    await qualityRef.update({ questionType: 'exercise', expectedAnswer: '2/6 = 2/3' });
    await assert.rejects(checkQuality(), error => error.code === 'failed-precondition');
    await qualityRef.update({ expectedAnswer: '2/6 = 1/3' });
    await checkQuality();
    console.log('ASSESSMENT_QUALITY_GATE_EMULATOR_PASS: synthetic stored rows only; manual correction unblocks mechanical checks, no provider call');
    await qualityRef.update({ questionType: 'multiple_choice', choices: ['7', '8'], correctAnswer: '8', expectedAnswer: '3 + 4 = 7' });
    await assert.rejects(checkQuality(), error => error.code === 'failed-precondition');
    await qualityRef.update({ correctAnswer: '7' });
    await checkQuality();
    await qualityRef.update({ choices: ['1/2', '2/4'], correctAnswer: '1/2', expectedAnswer: '1/2' });
    await assert.rejects(checkQuality(), error => error.code === 'failed-precondition');
    await qualityRef.update({ choices: ['1/2', '1/4'] });
    await checkQuality();
    console.log('CURRICULUM_ADOPTION_EMULATOR_PASS: scope, received decision, versions, concurrency, legacy preservation; no real pedagogical approval');
  } finally {
    await db.doc('assessmentItems/' + prefix + '-quality').delete();
    for (const version of (await ref.collection('versions').get()).docs) await version.ref.delete();
    await ref.delete();
    for (const doc of (await db.collection('audit_logs').where('schoolId', '==', schoolId).get()).docs) await doc.ref.delete();
    for (const role of ['secretary', 'boardViewer', 'foreign']) await db.doc('users/' + prefix + '-' + role).delete();
    await db.doc('academicYears/' + yearId).delete();
    await db.doc('curriculumPrograms/' + programId).delete();
    await db.doc('curriculumUnits/' + prefix).delete();
    await admin.app().delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
