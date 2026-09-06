import { describe, expect, it } from 'vitest';
import { allSubjectsValidated, sameAssessmentReviewVersion } from '../../functions/src/pedagogy/assessmentReview';
describe('subject-specific assessment approval', () => {
  const version = { generationVersion: 2, contentRevision: 1, sourceChecksum: 'synthetic-source' };
  const signature = (subjectId: string) => ({ ...version, subjectId, teacherStaffId: 'synthetic-teacher', recordedBy: 'synthetic-secretary', note: 'Synthetic received approval' });
  it('requires exactly one current approval for every subject', () => {
    expect(allSubjectsValidated(['math', 'fr'], [signature('math')], version)).toBe(false);
    expect(allSubjectsValidated(['math', 'fr'], [signature('math'), signature('fr')], version)).toBe(true);
    expect(allSubjectsValidated(['math'], [signature('math'), signature('math')], version)).toBe(false);
    expect(allSubjectsValidated([], [], version)).toBe(false);
  });
  it('invalidates approval after generation, correction or teaching source changes', () => {
    for (const changed of [{ ...version, generationVersion: 3 }, { ...version, contentRevision: 2 }, { ...version, sourceChecksum: 'changed' }]) {
      expect(sameAssessmentReviewVersion(version, changed)).toBe(false);
      expect(allSubjectsValidated(['math'], [signature('math')], changed)).toBe(false);
    }
  });
  it('does not certify a signature without teacher, recorder and received-decision note', () => {
    expect(allSubjectsValidated(['math'], [{ ...signature('math'), teacherStaffId: '' }], version)).toBe(false);
    expect(allSubjectsValidated(['math'], [{ ...signature('math'), note: '' }], version)).toBe(false);
    expect(allSubjectsValidated(['math'], [{ ...signature('math'), recordedBy: '' }], version)).toBe(false);
  });
});
