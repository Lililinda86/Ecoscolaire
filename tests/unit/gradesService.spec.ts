import { describe, it, expect } from 'vitest';
import { validateGradeInput, analyzeLegacyGrade, buildGradeCreateMutation, buildGradeUpdateMutation, validateEvaluationInput } from '../../src/services/gradesService';
import type { Grade, CreateGradeInput, UpdateGradeInput, LegacyGrade } from '../../src/types';

describe('Grades Service Validation', () => {
  const validCreateInput: CreateGradeInput = {
    schoolId: 'sch_1',
    academicYearId: 'ay_1',
    periodId: 'prd_1',
    evaluationId: 'ev_1',
    classId: 'cls_1',
    classSubjectId: 'csub_1',
    subjectId: 'sub_1',
    studentId: 'stu_1',
    teacherId: 'tch_1',
    status: 'draft',
    resultStatus: 'scored',
    score: 15,
    maxScore: 20
  };

  const validGrade: Grade = buildGradeCreateMutation(validCreateInput, 'user1');

  it('1. Grade scored valide', () => {
    const res = validateGradeInput(validGrade);
    expect(res.isValid).toBe(true);
  });

  it('2. scored sans score refus�e', () => {
    const invalid = { ...validGrade, score: undefined };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('3. scored avec score n�gatif refus�e', () => {
    const invalid = { ...validGrade, score: -5 };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('4. scored au-dessus du maximum refus�e', () => {
    const invalid = { ...validGrade, score: 25 };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('5. maxScore nul refus�', () => {
    const invalid = { ...validGrade, maxScore: 0 };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('6. maxScore NaN refus�', () => {
    const invalid = { ...validGrade, maxScore: NaN };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('7. score Infinity refus�', () => {
    const invalid = { ...validGrade, score: Infinity };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('8. absent sans score accept�', () => {
    const absent = { ...validGrade, resultStatus: 'absent' as const };
    delete absent.score;
    const res = validateGradeInput(absent);
    expect(res.isValid).toBe(true);
  });

  it('9. absent avec score refus�', () => {
    const absent = { ...validGrade, resultStatus: 'absent' as const, score: 0 };
    const res = validateGradeInput(absent);
    expect(res.isValid).toBe(false);
  });

  it('12. champ relationnel manquant refus�', () => {
    const invalid = { ...validGrade, schoolId: undefined };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('13. version invalide refus�e', () => {
    const invalid = { ...validGrade, version: 0 };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('14. cr�ation initialise version � 1', () => {
    expect(validGrade.version).toBe(1);
    expect(validGrade.createdAt).toBeDefined();
  });

  it('15. update incr�mente exactement de 1', () => {
    const updateInput: UpdateGradeInput = { score: 18, expectedVersion: 1 };
    const updated = buildGradeUpdateMutation(validGrade, updateInput, 'user2');
    expect(updated.version).toBe(2);
    expect(updated.score).toBe(18);
  });

  it('16. conflit expectedVersion refus�', () => {
    const updateInput: UpdateGradeInput = { expectedVersion: 2 }; // mismatch
    expect(() => buildGradeUpdateMutation(validGrade, updateInput, 'user2')).toThrow(/Conflit/);
  });

  it('17. createdAt pr�serv�', () => {
    const updateInput: UpdateGradeInput = { expectedVersion: 1 };
    const updated = buildGradeUpdateMutation(validGrade, updateInput, 'user2');
    expect(updated.createdAt).toBe(validGrade.createdAt);
  });

  it('20. aucun undefined r�cursif', () => {
    const updateInput: UpdateGradeInput = { expectedVersion: 1 };
    const updated = buildGradeUpdateMutation(validGrade, updateInput, 'user2');
    expect(Object.values(updated).some(v => v === undefined)).toBe(false);
  });

  it('21. legacy sans schoolId signal�e, non compl�t�e', () => {
    const legacy: LegacyGrade = { studentId: 'stu1', subjectId: 'sub1', date: '2023-10-01', maxScore: 20, score: 10 };
    const analysis = analyzeLegacyGrade(legacy);
    expect(analysis.missingFields).toContain('schoolId');
    expect(analysis.isMigratable).toBe(false);
  });
});

describe('Evaluation Weight Validation', () => {
  it('weight 1 accept', () => {
    const res = validateEvaluationInput({ weight: 1 });
    expect(res.isValid).toBe(true);
  });
  it('weight 2 appliqu', () => {
    const res = validateEvaluationInput({ weight: 2 });
    expect(res.isValid).toBe(true);
  });
  it('weight 0 refus', () => {
    const res = validateEvaluationInput({ weight: 0 });
    expect(res.isValid).toBe(false);
  });
  it('weight ngatif refus', () => {
    const res = validateEvaluationInput({ weight: -1 });
    expect(res.isValid).toBe(false);
  });
  it('weight vide refus', () => {
    const res = validateEvaluationInput({ weight: '' });
    expect(res.isValid).toBe(false);
  });
  it('weight non fini refus', () => {
    const res = validateEvaluationInput({ weight: Infinity });
    expect(res.isValid).toBe(false);
  });
});
