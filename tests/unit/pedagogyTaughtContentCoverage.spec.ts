import { describe, expect, it } from 'vitest';
import { bindTaughtSnapshot, taughtContentIssues } from '../../functions/src/pedagogy/taughtContentCoverage';
import type { GeneratedAssessmentItem, ValidatedPreparationSource } from '../../functions/src/pedagogy/weeklyAssessmentGenerator';
const source: ValidatedPreparationSource = { id: 'source', version: 2, subjectId: 'math', classSubjectId: 'class-math', subjectName: 'Math', curriculumUnitId: null, lessonTitle: 'Doubling', objective: null, pedagogicalContent: '1/2 = 2/4; 2/3 = 4/6. Multiplying numerator and denominator by two preserves the value. Only these examples; no addition, subtraction, simplification or multiplication of two fractions.', teachingConfirmationId: 'confirmation-2', teachingStatus: 'partially_taught', effectiveTeachingDate: '2026-09-08' };
const item: GeneratedAssessmentItem = { subjectId: 'math', classSubjectId: 'class-math', sourceLessonPreparationIds: ['source'], sourceCurriculumUnitIds: [], questionType: 'exercise', questionText: 'Double numerator and denominator of 1/2.', instructions: 'Explain.', expectedAnswer: '2/4', correctionGuide: 'Numerator 1 × 2 = 2; denominator 2 × 2 = 4.', difficulty: 'easy', order: 1, points: 20 };
const check = (changes: Partial<GeneratedAssessmentItem> = {}, sources = [source]) => {
  const value = { ...item, ...changes };
  return taughtContentIssues({ ...value, ...bindTaughtSnapshot(value, sources) }, sources);
};
describe('taught snapshot coverage, no provider calls', () => {
  it('binds exact portions and versions but never auto-certifies semantics', () => {
    expect(check()).toEqual([]);
    expect(bindTaughtSnapshot(item, [source]).coverageStatus).toBe('HUMAN_REVIEW_REQUIRED');
    expect(bindTaughtSnapshot(item, [{ ...source, version: 3 }])).not.toEqual(bindTaughtSnapshot(item, [source]));
  });
  it.each(['expectedAnswer', 'correctionGuide', 'questionText', 'instructions'] as const)('rejects the recorded EN fraction product in %s', field => {
    expect(check({ [field]: '1/2 × 2/2 = 2/4' })).toContain('OUTSIDE_TAUGHT_CONTENT:' + field + ':FRACTION_PRODUCT');
  });
  it('rejects the equivalent French drift', () => {
    const fr = { ...source, pedagogicalContent: '1/2 = 2/4. Doubler le numérateur et le dénominateur. Pas de multiplication de deux fractions.' };
    expect(check({ correctionGuide: 'Multiplier deux fractions : 1/2 × 2/2 = 2/4.' }, [fr])).toContain('OUTSIDE_TAUGHT_CONTENT:correctionGuide:FRACTION_PRODUCT');
  });
  it('rejects untaught questions, not just answers', () => {
    expect(check({ questionText: 'Subtract 4 − 2.' })).toContain('OUTSIDE_TAUGHT_CONTENT:questionText:SUBTRACTION');
    expect(check({ questionText: 'Compute 2^3.' })).toContain('OUTSIDE_TAUGHT_CONTENT:questionText:POWER');
  });
  it('does not treat forbidden operations in the source as taught evidence', () => {
    expect(check({ expectedAnswer: 'Multiply two fractions.' })).toContain('OUTSIDE_TAUGHT_CONTENT:expectedAnswer:FRACTION_PRODUCT');
  });
  it('allows explicitly taught fraction products without claiming semantic approval', () => {
    expect(check({ expectedAnswer: '1/2 × 2/2 = 2/4' }, [{ ...source, pedagogicalContent: '1/2 × 2/2 = 2/4' }])).toEqual([]);
  });
  it('rejects missing, foreign or wrong-subject preparation references', () => {
    expect(check({ sourceLessonPreparationIds: [] })).toContain('SOURCE_PREPARATIONS_REQUIRED');
    expect(check({ sourceLessonPreparationIds: ['foreign-school-source'] })).toContain('SOURCE_OUTSIDE_TAUGHT_SNAPSHOT');
    expect(check({ subjectId: 'another-subject' })).toContain('SOURCE_OUTSIDE_TAUGHT_SNAPSHOT');
  });
  it('rejects old hashes, absent teaching confirmation and curriculum expansion', () => {
    expect(taughtContentIssues(item, [source])).toContain('TAUGHT_SNAPSHOT_BINDING_MISSING_OR_STALE');
    expect(check({}, [{ ...source, teachingConfirmationId: undefined }])).toContain('SOURCE_OUTSIDE_TAUGHT_SNAPSHOT');
    expect(check({ sourceCurriculumUnitIds: ['official-but-untaught'] })).toContain('CURRICULUM_CANNOT_EXPAND_TAUGHT_CONTENT');
  });
});
