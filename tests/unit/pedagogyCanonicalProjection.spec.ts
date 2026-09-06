import { describe, expect, it } from 'vitest';
import { isStrictGradeDocument } from '../../src/services/gradeSchemaPartition';
import { validateGradeInput } from '../../src/services/gradesService';
import { normalizeCanonicalGrade } from '../../functions/src/academic/canonicalGradeCalculations';
import type { Grade } from '../../src/types';
describe('pedagogy canonical non-score projection', () => {
  const base = { id: 'gr_synthetic', schoolId: 'synthetic-school', academicYearId: 'synthetic-year', periodId: 'synthetic-period', evaluationId: 'synthetic-evaluation', classId: 'synthetic-class', classSubjectId: 'synthetic-class-subject', subjectId: 'synthetic-subject', studentId: 'synthetic-pupil', teacherId: 'synthetic-offline-teacher', status: 'draft', version: 1, maxScore: 10, createdAt: '2026-09-04', updatedAt: '2026-09-04', createdBy: 'synthetic-secretary', updatedBy: 'synthetic-secretary' };
  it.each(['absent', 'excused', 'notSubmitted', 'notEvaluated'] as const)('preserves %s as a strict canonical non-score', resultStatus => {
    const grade = { ...base, resultStatus } as Grade;
    expect(isStrictGradeDocument(grade)).toBe(true);
    expect(validateGradeInput(grade).isValid).toBe(true);
    expect(normalizeCanonicalGrade({ evaluationId: grade.evaluationId, resultStatus, maxScore: 10 }).normalizedScore).toBeNull();
    expect(validateGradeInput({ ...grade, score: 0 }).isValid).toBe(false);
  });
  it('keeps explicit zero calculable and missing data non-calculable', () => {
    expect(normalizeCanonicalGrade({ evaluationId: 'synthetic', resultStatus: 'scored', score: 0, maxScore: 10 }).normalizedScore).toBe(0);
    expect(normalizeCanonicalGrade({ evaluationId: 'synthetic', resultStatus: 'missing', maxScore: 10 }).calculable).toBe(false);
  });
});
