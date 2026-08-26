import { describe, expect, test } from 'vitest';
import { groupGradesByClassSubject, calculateSubjectAverage } from '../../src/services/gradeCalculations';
import type { Evaluation, Grade } from '../../src/types';

const evaluation = (id: string, status: Evaluation['status'], maxScore = 20, weight = 1): Evaluation => ({
  id, schoolId: 's', academicYearId: 'y', periodId: 'p', classId: 'c', subjectId: 'math', classSubjectId: 'cs',
  teacherId: 'staff', teacherAssignmentId: 'assignment', title: id, type: 'exam', date: '2026-08-26', maxScore, weight,
  status, version: 1, createdAt: '', createdBy: '', updatedAt: '', updatedBy: '',
});
const grade = (evaluationId: string, score: number, resultStatus: Grade['resultStatus'] = 'scored'): Grade => ({
  id: `g-${evaluationId}`, schoolId: 's', academicYearId: 'y', periodId: 'p', evaluationId, classId: 'c',
  classSubjectId: 'cs', subjectId: 'math', studentId: 'student', teacherId: 'staff', status: 'draft', resultStatus,
  ...(resultStatus === 'scored' ? { score } : {}), maxScore: 20, version: 1, createdAt: '', createdBy: '', updatedAt: '', updatedBy: '',
});
const subjects = [{ classSubjectId: 'cs', subjectId: 'math', name: 'Math', code: 'M', coefficient: 2, weeklyHours: 1, isRequired: true, displayOrder: 1 }];

describe('published-only canonical calculations', () => {
  test('excludes draft, locked and cancelled evaluations', () => {
    const summaries = groupGradesByClassSubject(
      [grade('published', 10), grade('draft', 20), grade('locked', 20), grade('cancelled', 20)], subjects,
      [evaluation('published', 'published'), evaluation('draft', 'draft'), evaluation('locked', 'locked'), evaluation('cancelled', 'cancelled')]
    );
    summaries.forEach(calculateSubjectAverage);
    expect(summaries[0].rawAverage).toBe(10);
  });

  test('normalizes mixed scales and applies evaluation weight without rounding early', () => {
    const first = grade('ten', 5); first.maxScore = 10;
    const second = grade('forty', 40); second.maxScore = 40;
    const summaries = groupGradesByClassSubject([first, second], subjects, [evaluation('ten', 'published', 10, 1), evaluation('forty', 'published', 40, 3)]);
    summaries.forEach(calculateSubjectAverage);
    expect(summaries[0].rawAverage).toBe(17.5);
  });

  test('keeps zero scored and excludes absent/missing from the average', () => {
    const summaries = groupGradesByClassSubject(
      [grade('zero', 0), grade('absent', 0, 'absent'), grade('missing', 0, 'notSubmitted')], subjects,
      [evaluation('zero', 'published'), evaluation('absent', 'published'), evaluation('missing', 'published')]
    );
    summaries.forEach(calculateSubjectAverage);
    expect(summaries[0].rawAverage).toBe(0);
    expect(summaries[0].evaluations.find(item => item.evaluationId === 'absent')?.normalizedScore).toBeNull();
  });
});
