import { describe, test, expect } from 'vitest';
import { upsertEvaluationInCache } from '../../src/services/evaluationUpsert';
import { Evaluation } from '../../src/types';

describe('evaluationUpsert service', () => {
  test('1. nouvelle Evaluation version 1', () => {
    const cache: Evaluation[] = [];
    const newEval: Evaluation = {
      id: 'ev1', schoolId: 's1', academicYearId: 'ay', periodId: 'p1', classId: 'c1',
      classSubjectId: 'csub1', title: 'Eval 1', type: 'oral', date: '2023-10-01', status: 'draft',
      maxScore: 20, weight: 1, teacherId: 't1', version: 1,
      createdAt: 't1', createdBy: 'u1', updatedAt: 't1', updatedBy: 'u1'
    };

    upsertEvaluationInCache(cache, newEval);

    expect(cache).toHaveLength(1);
    expect(cache[0].version).toBe(1);
    expect(cache[0].createdAt).toBe('t1');
    expect(cache[0].createdBy).toBe('u1');
  });

  test('2. Evaluation existante r\u00e9utilis\u00e9e & 3. aucun UUID', () => {
    const cache: Evaluation[] = [{
      id: 'ev2', schoolId: 's1', academicYearId: 'ay', periodId: 'p1', classId: 'c1',
      classSubjectId: 'csub1', title: 'Eval 2', type: 'oral', date: '2023-10-01', status: 'draft',
      maxScore: 40, weight: 2, teacherId: 't1', version: 1,
      createdAt: 't1', createdBy: 'u1', updatedAt: 't1', updatedBy: 'u1'
    }];

    const updatedEval: Evaluation = {
      id: 'ev2', schoolId: 's1', academicYearId: 'ay', periodId: 'p1', classId: 'c1',
      classSubjectId: 'csub1', title: 'Eval 2 Modif', type: 'oral', date: '2023-10-01', status: 'draft',
      maxScore: 40, weight: 2, teacherId: 't1', version: 1,
      createdAt: 't2', createdBy: 'u2', updatedAt: 't2', updatedBy: 'u2'
    };

    upsertEvaluationInCache(cache, updatedEval);

    expect(cache).toHaveLength(1);
    expect(cache[0].id).toBe('ev2'); // 3. aucun UUID nouveau
    expect(cache[0].version).toBe(2);
    expect(cache[0].title).toBe('Eval 2 Modif');
    expect(cache[0].maxScore).toBe(40); // 5. maxScore repris
    expect(cache[0].weight).toBe(2); // 6. weight repris
    expect(cache[0].createdAt).toBe('t1'); // 7. createdAt pr\u00e9serv\u00e9
    expect(cache[0].createdBy).toBe('u1'); // 8. createdBy pr\u00e9serv\u00e9
  });
});
