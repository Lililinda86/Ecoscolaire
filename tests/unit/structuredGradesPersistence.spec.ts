import { describe, it, expect, vi } from 'vitest';
import { saveStructuredEvaluationGrades } from '../../src/services/structuredGradesPersistence';
import type { Evaluation, Grade } from '../../src/types';
import { buildGradeId } from '../../src/utils/gradeIds';

const mocks = vi.hoisted(() => ({
  mockSet: vi.fn(),
  mockCommit: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('firebase/firestore', () => {
  return {
    doc: vi.fn((fs, path, id) => `${path}/${id}`),
    writeBatch: vi.fn(() => ({
      set: mocks.mockSet,
      commit: mocks.mockCommit
    }))
  };
});

describe('structuredGradesPersistence', () => {
  const getMockFirestore = () => ({} as import('firebase/firestore').Firestore);

  const baseEval: Evaluation = {
    id: 'eval-1', schoolId: 'sch-1', academicYearId: 'ay-1', periodId: 'p-1',
    classId: 'c-1', classSubjectId: 'cs-1', subjectId: 'subj-1', teacherId: 't-1', maxScore: 20, weight: 1,
    name: 'Eval', date: '2026-07-28', status: 'validated', createdAt: 'date', createdBy: 'u', updatedAt: 'date', updatedBy: 'u', version: 1
  };

  const createGrade = (overrides: Partial<Grade>): Grade => ({
    id: overrides.studentId ? buildGradeId('eval-1', overrides.studentId) : buildGradeId('eval-1', 's-1'),
    schoolId: 'sch-1', academicYearId: 'ay-1', periodId: 'p-1', classId: 'c-1', classSubjectId: 'cs-1', subjectId: 'subj-1', teacherId: 't-1', evaluationId: 'eval-1', maxScore: 20, studentId: 's-1',
    resultStatus: 'scored', score: 12, status: 'validated', createdAt: 'date', createdBy: 'u', updatedAt: 'date', updatedBy: 'u', version: 1,
    ...overrides
  });

  it('writes Evaluation to evaluations and Grade to grades using writeBatch without merge', async () => {
    mocks.mockSet.mockClear();
    mocks.mockCommit.mockClear();
    
    const gradesData = [
      createGrade({ id: buildGradeId('eval-1', 's-1'), studentId: 's-1', score: 12, resultStatus: 'scored' }),
      createGrade({ id: buildGradeId('eval-1', 's-2'), studentId: 's-2', score: undefined, resultStatus: 'absent' })
    ];

    await saveStructuredEvaluationGrades({
      firestore: getMockFirestore(),
      evaluation: baseEval,
      grades: gradesData
    });

    // 1 evaluation + 2 grades = 3 sets
    expect(mocks.mockSet).toHaveBeenCalledTimes(3);
    expect(mocks.mockSet).toHaveBeenCalledWith('evaluations/eval-1', baseEval);
    expect(mocks.mockSet).toHaveBeenCalledWith('grades/' + buildGradeId('eval-1', 's-1'), gradesData[0]);
    expect(mocks.mockSet).toHaveBeenCalledWith('grades/' + buildGradeId('eval-1', 's-2'), gradesData[1]);
    
    expect(mocks.mockCommit).toHaveBeenCalledOnce();
  });

  it('rejects collision of grade IDs', async () => {
    const gradesData = [
      createGrade({ id: buildGradeId('eval-1', 's-1'), studentId: 's-1' }),
      createGrade({ id: buildGradeId('eval-1', 's-1'), studentId: 's-2' }) // SAME ID
    ];

    await expect(saveStructuredEvaluationGrades({
      firestore: getMockFirestore(),
      evaluation: baseEval,
      grades: gradesData
    })).rejects.toThrow("Collision d'ID détectée dans les notes");
  });

  it('rejects invalid grade ID format', async () => {
    const gradesData = [
      createGrade({ id: 'bad-id', studentId: 's-1' })
    ];

    await expect(saveStructuredEvaluationGrades({
      firestore: getMockFirestore(),
      evaluation: baseEval,
      grades: gradesData
    })).rejects.toThrow("Invalid grade ID format");
  });

  it('rejects multiple grades for the same student', async () => {
    const gradesData = [
      createGrade({ id: buildGradeId('eval-1', 's-1'), studentId: 's-1' }),
      createGrade({ id: buildGradeId('eval-1', 's-1') + '_dup', studentId: 's-1' }) // SAME STUDENT
    ];

    await expect(saveStructuredEvaluationGrades({
      firestore: getMockFirestore(),
      evaluation: baseEval,
      grades: gradesData
    })).rejects.toThrow("Multiple grades for the same student in this evaluation payload");
  });

  it('rejects inconsistent schoolId between evaluation and grade', async () => {
    const gradesData = [
      createGrade({ id: buildGradeId('eval-1', 's-1'), schoolId: 'OTHER_SCHOOL' })
    ];

    await expect(saveStructuredEvaluationGrades({
      firestore: getMockFirestore(),
      evaluation: baseEval,
      grades: gradesData
    })).rejects.toThrow("Inconsistent schoolId between grade and evaluation");
  });

  it('rejects over 500 operations', async () => {
    const manyGrades = Array.from({ length: 500 }, (_, i) => createGrade({ id: buildGradeId('eval-1', `s-${i}`), studentId: `s-${i}` }));
    await expect(saveStructuredEvaluationGrades({
      firestore: getMockFirestore(),
      evaluation: baseEval,
      grades: manyGrades
    })).rejects.toThrow("Le nombre de notes dépasse la limite technique d'un enregistrement unique (500).");
  });
});
