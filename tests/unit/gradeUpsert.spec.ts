import { describe, test, expect } from 'vitest';
import { upsertGradeInCache } from '../../src/services/gradeUpsert';
import { Grade } from '../../src/types';
import { buildGradeId } from '../../src/utils/gradeIds';

describe('gradeUpsert service', () => {
  test('A. Premier enregistrement', () => {
    const cache: Grade[] = [];
    const gradeId = buildGradeId('ev1', 'stu1');
    const newGrade: Grade = {
      id: gradeId, schoolId: 's1', academicYearId: 'ay1', periodId: 'p1', classId: 'c1',
      classSubjectId: 'cs1', subjectId: 'sub1', studentId: 'stu1', evaluationId: 'ev1',
      teacherId: 't1', status: 'validated', resultStatus: 'scored', score: 12, maxScore: 20,
      version: 1, createdAt: 'time1', createdBy: 'u1', updatedAt: 'time1', updatedBy: 'u1'
    };

    upsertGradeInCache(cache, newGrade);

    expect(cache).toHaveLength(1);
    expect(cache[0].version).toBe(1);
    expect(cache[0].createdAt).toBe('time1');
    expect(cache[0].createdBy).toBe('u1');
  });
  
  test('D. Evaluation existante slectionne', () => {
    const existingEvaluation = {
      id: 'ev2', maxScore: 40, weight: 2
    };
    
    // Simulation of Grades.tsx logic
    const selectedEvaluationId = 'ev2';
    const isExisting = true;
    
    const finalEvalId = isExisting ? selectedEvaluationId : 'ev_new';
    const finalMaxScore = isExisting ? existingEvaluation.maxScore : 20;
    const finalWeight = isExisting ? existingEvaluation.weight : 1;
    
    const newGradeId = buildGradeId(finalEvalId, 'stu1');
    
    expect(finalEvalId).toBe('ev2');
    expect(finalMaxScore).toBe(40);
    expect(finalWeight).toBe(2);
    expect(newGradeId).toBe(buildGradeId('ev2', 'stu1'));
  });

  test('B. Deuxième enregistrement de la même évaluation et du même élève', () => {
    const gradeId = buildGradeId('ev1', 'stu1');
    const cache: Grade[] = [{
      id: gradeId, schoolId: 's1', academicYearId: 'ay1', periodId: 'p1', classId: 'c1',
      classSubjectId: 'cs1', subjectId: 'sub1', studentId: 'stu1', evaluationId: 'ev1',
      teacherId: 't1', status: 'validated', resultStatus: 'scored', score: 12, maxScore: 20,
      version: 1, createdAt: 'time1', createdBy: 'u1', updatedAt: 'time1', updatedBy: 'u1'
    }];
    
    const newGrade: Grade = {
      id: gradeId, schoolId: 's1', academicYearId: 'ay1', periodId: 'p1', classId: 'c1',
      classSubjectId: 'cs1', subjectId: 'sub1', studentId: 'stu1', evaluationId: 'ev1',
      teacherId: 't1', status: 'validated', resultStatus: 'scored', score: 12, maxScore: 20,
      version: 1, createdAt: 'time2', createdBy: 'u2', updatedAt: 'time2', updatedBy: 'u2'
    };

    upsertGradeInCache(cache, newGrade);

    expect(cache).toHaveLength(1);
    expect(cache[0].version).toBe(2);
    expect(cache[0].createdAt).toBe('time1');
    expect(cache[0].createdBy).toBe('u1');
    expect(cache[0].updatedAt).toBe('time2');
    expect(cache[0].updatedBy).toBe('u2');
  });

  test('C. Troisième enregistrement avec score 14', () => {
    const gradeId = buildGradeId('ev1', 'stu1');
    const cache: Grade[] = [{
      id: gradeId, schoolId: 's1', academicYearId: 'ay1', periodId: 'p1', classId: 'c1',
      classSubjectId: 'cs1', subjectId: 'sub1', studentId: 'stu1', evaluationId: 'ev1',
      teacherId: 't1', status: 'validated', resultStatus: 'scored', score: 12, maxScore: 20,
      version: 2, createdAt: 'time1', createdBy: 'u1', updatedAt: 'time2', updatedBy: 'u2'
    }];
    
    const newGrade: Grade = {
      id: gradeId, schoolId: 's1', academicYearId: 'ay1', periodId: 'p1', classId: 'c1',
      classSubjectId: 'cs1', subjectId: 'sub1', studentId: 'stu1', evaluationId: 'ev1',
      teacherId: 't1', status: 'validated', resultStatus: 'scored', score: 14, maxScore: 20,
      version: 1, createdAt: 'time3', createdBy: 'u3', updatedAt: 'time3', updatedBy: 'u3'
    };

    upsertGradeInCache(cache, newGrade);

    expect(cache).toHaveLength(1);
    expect(cache[0].version).toBe(3);
    expect(cache[0].score).toBe(14);
  });
});
