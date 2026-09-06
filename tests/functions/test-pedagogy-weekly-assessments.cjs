const assert = require('node:assert/strict');
const { assessmentId, coverageFor, deterministicWeeklyAssessmentGenerator, sourceChecksum, validateWeeklyAssessmentResult } = require('../../functions/lib/pedagogy/weeklyAssessmentGenerator');
(async () => {
  const prep = id => ({ id, version: 2, subjectId: id, classSubjectId: `class-${id}`, subjectName: id, curriculumUnitId: `unit-${id}`, lessonTitle: id, objective: id, pedagogicalContent: id });
  assert.equal(assessmentId('school', 'year', 'class', 'week'), 'school__year__class__week');
  const coverage = coverageFor([{ subjectId: 'math' }, { subjectId: 'fr' }], [prep('math')]); assert.equal(coverage.validatedPreparationCount, 1); assert.deepEqual(coverage.missingSubjects.map(item => item.id), ['fr']);
  assert.equal(sourceChecksum([prep('math')]), sourceChecksum([prep('math')]));
  const base = { school: { id: 'school', name: 'École' }, academicYear: { id: 'year', name: '2026' }, class: { id: 'class', name: 'CE1' }, week: { id: 'week', startDate: '2026-09-07', endDate: '2026-09-13', fridayDate: '2026-09-11' }, validatedPreparations: [prep('math'), prep('fr')], subjects: [], pedagogicalContent: [], assessmentPolicy: { totalPoints: 20, durationMinutes: 60 } };
  const result = await deterministicWeeklyAssessmentGenerator.generate(base); assert.equal(result.items.reduce((sum, item) => sum + item.points, 0), 20); assert.equal(validateWeeklyAssessmentResult(result).items.length, 2);
  await assert.rejects(() => deterministicWeeklyAssessmentGenerator.generate({ ...base, validatedPreparations: [] }), /NO_VALIDATED_PREPARATIONS/);
  console.log('Pedagogy weekly assessment function contracts passed.');
})().catch(error => { console.error(error); process.exit(1); });
