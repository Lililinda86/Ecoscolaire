import { describe, it, expect } from 'vitest';
import { validateGradeInput, analyzeLegacyGrade, buildGradeCreateMutation, buildGradeUpdateMutation } from '../../src/services/gradesService';
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

  it('2. scored sans score refusée', () => {
    const invalid = { ...validGrade, score: undefined };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('3. scored avec score négatif refusée', () => {
    const invalid = { ...validGrade, score: -5 };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('4. scored au-dessus du maximum refusée', () => {
    const invalid = { ...validGrade, score: 25 };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('5. maxScore nul refusé', () => {
    const invalid = { ...validGrade, maxScore: 0 };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('6. maxScore NaN refusé', () => {
    const invalid = { ...validGrade, maxScore: NaN };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('7. score Infinity refusé', () => {
    const invalid = { ...validGrade, score: Infinity };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('8. absent sans score accepté', () => {
    const absent = { ...validGrade, resultStatus: 'absent' as const };
    delete absent.score;
    const res = validateGradeInput(absent);
    expect(res.isValid).toBe(true);
  });

  it('9. absent avec score refusé', () => {
    const absent = { ...validGrade, resultStatus: 'absent' as const, score: 0 };
    const res = validateGradeInput(absent);
    expect(res.isValid).toBe(false);
  });

  it('12. champ relationnel manquant refusé', () => {
    const invalid = { ...validGrade, schoolId: undefined };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('13. version invalide refusée', () => {
    const invalid = { ...validGrade, version: 0 };
    const res = validateGradeInput(invalid);
    expect(res.isValid).toBe(false);
  });

  it('14. création initialise version à 1', () => {
    expect(validGrade.version).toBe(1);
    expect(validGrade.createdAt).toBeDefined();
  });

  it('15. update incrémente exactement de 1', () => {
    const updateInput: UpdateGradeInput = { score: 18, expectedVersion: 1 };
    const updated = buildGradeUpdateMutation(validGrade, updateInput, 'user2');
    expect(updated.version).toBe(2);
    expect(updated.score).toBe(18);
  });

  it('16. conflit expectedVersion refusé', () => {
    const updateInput: UpdateGradeInput = { expectedVersion: 2 }; // mismatch
    expect(() => buildGradeUpdateMutation(validGrade, updateInput, 'user2')).toThrow(/Conflit/);
  });

  it('17. createdAt préservé', () => {
    const updateInput: UpdateGradeInput = { expectedVersion: 1 };
    const updated = buildGradeUpdateMutation(validGrade, updateInput, 'user2');
    expect(updated.createdAt).toBe(validGrade.createdAt);
  });

  it('20. aucun undefined récursif', () => {
    const updateInput: UpdateGradeInput = { expectedVersion: 1 };
    const updated = buildGradeUpdateMutation(validGrade, updateInput, 'user2');
    expect(Object.values(updated).some(v => v === undefined)).toBe(false);
  });

  it('21. legacy sans schoolId signalée, non complétée', () => {
    const legacy: LegacyGrade = { studentId: 'stu1', subjectId: 'sub1', date: '2023-10-01', maxScore: 20, score: 10 };
    const analysis = analyzeLegacyGrade(legacy);
    expect(analysis.missingFields).toContain('schoolId');
    expect(analysis.isMigratable).toBe(false);
  });
});
