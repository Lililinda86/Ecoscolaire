import { describe, it, expect } from 'vitest';
import { partitionGradeDocuments } from '../../src/services/gradeSchemaPartition';
import type { Grade } from '../../src/types';

describe('gradeSchemaPartition', () => {
  const createStrictGrade = (overrides?: Partial<Grade>): Grade => ({
    id: 'g-strict-1',
    schoolId: 'sch-1',
    academicYearId: 'ay-1',
    periodId: 'p-1',
    evaluationId: 'eval-1',
    classId: 'cl-1',
    classSubjectId: 'csubj-1',
    subjectId: 'subj-1',
    studentId: 'st-1',
    teacherId: 'tch-1',
    status: 'validated',
    resultStatus: 'scored',
    score: 15,
    maxScore: 20,
    createdAt: '2023-01-01T00:00:00.000Z',
    createdBy: 'tch-1',
    updatedAt: '2023-01-01T00:00:00.000Z',
    updatedBy: 'tch-1',
    version: 1,
    ...(overrides || {})
  });

  it('classifies a valid strict grade as strictGrades', () => {
    const strictGrade = createStrictGrade();
    const result = partitionGradeDocuments([strictGrade]);
    expect(result.strictGrades).toHaveLength(1);
    expect(result.strictGrades[0]).toEqual(strictGrade);
    expect(result.legacyGrades).toHaveLength(0);
    expect(result.invalidGrades).toHaveLength(0);
  });

  it('classifies a valid legacy grade as legacyGrades', () => {
    const legacyGrade = {
      id: 'g-legacy-1',
      schoolId: 'sch-1',
      studentId: 'st-1',
      classId: 'cl-1',
      subject: 'Math',
      value: 12,
      date: '2022-05-10'
    };
    
    const result = partitionGradeDocuments([legacyGrade]);
    expect(result.legacyGrades).toHaveLength(1);
    expect(result.legacyGrades[0]).toEqual(legacyGrade);
    expect(result.strictGrades).toHaveLength(0);
    expect(result.invalidGrades).toHaveLength(0);
  });

  it('classifies an incomplete strict grade as invalid', () => {
    const incompleteStrictGrade = {
      id: 'g-strict-2',
      schoolId: 'sch-1',
      academicYearId: 'ay-1',
      // missing periodId, evaluationId
      classId: 'cl-1',
      studentId: 'st-1',
      status: 'validated',
      resultStatus: 'scored',
      score: 15,
      maxScore: 20
    };
    
    const result = partitionGradeDocuments([incompleteStrictGrade]);
    expect(result.invalidGrades).toHaveLength(1);
    expect(result.strictGrades).toHaveLength(0);
    expect(result.legacyGrades).toHaveLength(0);
  });

  it('classifies hybrid documents as invalid', () => {
    const hybridGrade = {
      id: 'g-hybrid',
      schoolId: 'sch-1',
      studentId: 'st-1',
      classId: 'cl-1',
      subject: 'Math',
      value: 15, // legacy field
      date: '2023-01-01', // legacy field
      evaluationId: 'eval-1', // strict field
      academicYearId: 'ay-1' // strict field
      // missing strict fields like version, status, etc.
    };
    
    const result = partitionGradeDocuments([hybridGrade]);
    expect(result.invalidGrades).toHaveLength(1);
    expect(result.strictGrades).toHaveLength(0);
    expect(result.legacyGrades).toHaveLength(0);
  });

  it('classifies null or undefined or non-objects as invalid', () => {
    const result = partitionGradeDocuments([null, undefined, "not-an-object", 123]);
    expect(result.invalidGrades).toHaveLength(4);
    expect(result.strictGrades).toHaveLength(0);
    expect(result.legacyGrades).toHaveLength(0);
  });

  it('classifies valid strict grade with resultStatus = absent without score', () => {
    const strictGrade = createStrictGrade({ resultStatus: 'absent', score: undefined });
    const result = partitionGradeDocuments([strictGrade]);
    expect(result.strictGrades).toHaveLength(1);
  });

  it('classifies valid strict grade with resultStatus = exempt without score', () => {
    const strictGrade = createStrictGrade({ resultStatus: 'exempt', score: undefined });
    const result = partitionGradeDocuments([strictGrade]);
    expect(result.strictGrades).toHaveLength(1);
  });

  it('classifies valid strict grade with resultStatus = notSubmitted without score', () => {
    const strictGrade = createStrictGrade({ resultStatus: 'notSubmitted', score: undefined });
    const result = partitionGradeDocuments([strictGrade]);
    expect(result.strictGrades).toHaveLength(1);
  });

  it('invalidates strict grade if resultStatus is scored but no score', () => {
    const strictGrade = createStrictGrade({ resultStatus: 'scored', score: undefined });
    const result = partitionGradeDocuments([strictGrade]);
    expect(result.invalidGrades).toHaveLength(1);
  });

  it('invalidates strict grade if resultStatus is absent but has score', () => {
    const strictGrade = createStrictGrade({ resultStatus: 'absent', score: 10 });
    const result = partitionGradeDocuments([strictGrade]);
    expect(result.invalidGrades).toHaveLength(1);
  });
});
