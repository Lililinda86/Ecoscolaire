const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
async function seedResultsFixture(db, prefix) {
  if (!/^pedagogy-results-[a-f0-9]{16}$/.test(prefix)) throw new Error('Synthetic run prefix required.');
  const project = db.projectId;
  if (!(project === 'demo-ecoscolaire' && process.env.FIRESTORE_EMULATOR_HOST) &&
      !(project === 'ecoscolaire-staging' && process.env.PEDAGOGY_STAGING_E2E === 'true')) throw new Error('Demo emulator or explicitly selected Staging required; Production forbidden.');
  const f = { schoolId: prefix, academicYearId: `${prefix}-year`, classId: `${prefix}-class`, periodId: `${prefix}-period`, weekId: `${prefix}-week`, teacherId: `${prefix}-teacher`, secretaryId: `${prefix}-secretary`, directorId: `${prefix}-director`, assessmentId: `${prefix}-assessment`, programId: `${prefix}-program`, revisionId: `${prefix}-revision`, pupilIds: Array.from({ length: 5 }, (_, i) => `${prefix}-pupil-${i + 1}`) };
  const manifest = new Set(), batch = db.batch();
  const put = (collection, id, value) => { const path = `${collection}/${id}`; manifest.add(path); batch.create(db.doc(path), { id, ...value }); };
  put('schools', f.schoolId, { name: 'Synthetic results school', schoolCode: 'SYNTHETIC', academicYear: '2026-2027', activeAcademicYearId: f.academicYearId, subscriptionStatus: 'active', isActive: true });
  put('academicYears', f.academicYearId, { schoolId: f.schoolId, name: '2026-2027', status: 'active', startDate: '2026-08-01', endDate: '2027-07-31' });
  put('periods', f.periodId, { schoolId: f.schoolId, academicYearId: f.academicYearId, name: 'Synthetic period', status: 'open', startDate: '2026-08-01', endDate: '2027-07-31' });
  put('classes', f.classId, { schoolId: f.schoolId, name: 'CE1', type: 'francophone', section: 'francophone', isActive: true, status: 'active' });
  put('teachingWeeks', f.weekId, { schoolId: f.schoolId, academicYearId: f.academicYearId, weekNumber: 1, weekStartDate: '2026-08-31', weekEndDate: '2026-09-04', status: 'open' });
  put('classPrograms', f.programId, { schoolId: f.schoolId, academicYearId: f.academicYearId, classId: f.classId, status: 'published', publishedRevisionId: f.revisionId });
  put('staff', f.teacherId, { schoolId: f.schoolId, name: 'Synthetic offline teacher', role: 'teacher', isActive: true, status: 'active' });
  put('users', f.secretaryId, { schoolId: f.schoolId, name: 'Synthetic secretary', email: `${prefix}@example.invalid`, role: 'secretary', isActive: true });
  put('users', f.directorId, { schoolId: f.schoolId, name: 'Synthetic director', role: 'director', isActive: true });
  f.pupilIds.forEach((id, index) => put('students', id, { schoolId: f.schoolId, academicYearId: f.academicYearId, classId: f.classId, name: `Synthetic pupil ${index + 1}`, isActive: true, schoolingStatus: 'active' }));
  const sections = [], decisions = [], versions = {};
  for (const [index, suffix, title] of [[1, 'math', 'Mathematics'], [2, 'english', 'English']]) {
    const subjectId = `${prefix}-${suffix}`, classSubjectId = `${prefix}-cs-${suffix}`, assignmentId = `${prefix}-assignment-${suffix}`, prepId = `${prefix}-prep-${suffix}`;
    put('subjects', subjectId, { schoolId: f.schoolId, name: title, isActive: true });
    put('classSubjects', classSubjectId, { schoolId: f.schoolId, academicYearId: f.academicYearId, classId: f.classId, programId: f.programId, revisionId: f.revisionId, subjectId, isActive: true, coefficient: 1 });
    put('teacherAssignments', assignmentId, { schoolId: f.schoolId, academicYearId: f.academicYearId, classId: f.classId, subjectId, teacherStaffId: f.teacherId, sourceProgramId: f.programId, sourcePublishedRevisionId: f.revisionId, sourceClassSubjectId: classSubjectId, status: 'active', isActive: true });
    const reviewData = { lessonTitle: title, objective: 'Synthetic objective', lessonSteps: 'Synthetic teaching steps' }, currentUploadId = `${prefix}-upload-${suffix}`;
    const reviewChecksum = createHash('sha256').update(JSON.stringify({ uploadId: currentUploadId, review: ['lessonTitle', 'objective', 'prerequisites', 'materials', 'lessonSteps', 'assessment', 'differentiation'].map(field => [field, reviewData[field] || null]) })).digest('hex');
    put('lessonPreparations', prepId, { schoolId: f.schoolId, academicYearId: f.academicYearId, classId: f.classId, weekId: f.weekId, subjectId, version: 1, status: 'validated', reviewData, currentUploadId,
      teachingConfirmation: { id: `${prefix}-confirmation-${suffix}`, status: 'taught', effectiveDate: '2026-09-02', declaredByTeacherStaffId: f.teacherId, recordedBy: f.secretaryId, reviewChecksum, excerpts: [], note: 'Entirely synthetic fixture declaration' } });
    put('assessmentItems', `${prefix}-item-${suffix}`, { schoolId: f.schoolId, academicYearId: f.academicYearId, classId: f.classId, weekId: f.weekId, weeklyAssessmentId: f.assessmentId, generationVersion: 1, subjectId, classSubjectId, questionText: `Synthetic ${title} question`, instructions: 'Synthetic instruction', expectedAnswer: 'Synthetic answer', correctionGuide: 'Synthetic correction', points: 10, order: index, sourceLessonPreparationIds: [prepId] });
    sections.push({ subjectId, title, points: 10, itemOrders: [index] });
    decisions.push({ subjectId, teacherStaffId: f.teacherId, recordedBy: f.secretaryId, note: 'Entirely synthetic received decision; no real pedagogical approval', generationVersion: 1, contentRevision: 0, sourceChecksum: 'synthetic-source-checksum' });
    versions[prepId] = 1;
  }
  put('weeklyAssessments', f.assessmentId, { schoolId: f.schoolId, academicYearId: f.academicYearId, classId: f.classId, className: 'CE1', weekId: f.weekId, weekStartDate: '2026-08-31', weekEndDate: '2026-09-04', fridayDate: '2026-09-04', title: 'Synthetic weekly assessment', status: 'teacher_validated', generationStatus: 'succeeded', generationVersion: 1, contentRevision: 0, teacherValidated: true, teacherValidations: decisions, sourceChecksum: 'synthetic-source-checksum', sourcePreparationVersions: versions, sourcePreparationIds: Object.keys(versions), expectedPreparationCount: 2, validatedPreparationCount: 2, itemCount: 2, totalPoints: 20, durationMinutes: 60, sections, coveredSubjects: sections.map(item => ({ id: item.subjectId, name: item.title })), missingSubjects: [], policySnapshot: { version: 1, assessmentMode: 'numeric', totalPoints: 20, stage: 'primary' } });
  await batch.commit();
  return { ...f, async cleanup() {
    for (const name of ['evaluations', 'grades', 'pedagogyObservations', 'pedagogyRemediations', 'pedagogyRemediationRequests', 'pedagogyAssessmentPublications', 'pedagogyResultBatches', 'audit_logs']) {
      for (const document of (await db.collection(name).where('schoolId', '==', f.schoolId).get()).docs) {
        manifest.add(document.ref.path);
        if (name === 'grades') for (const item of (await document.ref.collection('pedagogyHistory').get()).docs) manifest.add(item.ref.path);
        if (name === 'pedagogyRemediations') for (const item of (await document.ref.collection('history').get()).docs) manifest.add(item.ref.path);
      }
    }
    const cleanup = db.batch(); [...manifest].forEach(path => cleanup.delete(db.doc(path))); await cleanup.commit();
    assert.ok((await Promise.all([...manifest].map(path => db.doc(path).get()))).every(item => !item.exists));
  } };
}
module.exports = { seedResultsFixture };
