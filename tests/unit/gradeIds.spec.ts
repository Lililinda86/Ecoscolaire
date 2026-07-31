import { describe, it, expect } from 'vitest';
import { buildAcademicYearId, buildEvaluationId, buildGradeId } from '../../src/utils/gradeIds';

describe('Grade IDs Generation', () => {
  it('garantit aucune collision entre différentes dates', () => {
    const id1 = buildAcademicYearId('sch1', '2026-09-01T10:00:00Z', '2027-06-30T10:00:00Z');
    const id2 = buildAcademicYearId('sch1', '2026-09-01', '2027-07-01');
    expect(id1).not.toBe(id2);
  });

  it('gère les espaces et caractères spéciaux de façon sécurisée', () => {
    const id = buildAcademicYearId('sch1', ' 2026-09-01 ', ' 2027-07-01 ');
    expect(id).toContain('sch1');
    expect(id).not.toContain(' ');
  });

  it('différencie deux écoles avec mêmes dates', () => {
    expect(buildAcademicYearId('s1', '2026', '2027')).not.toBe(buildAcademicYearId('s2', '2026', '2027'));
  });

  it('différencie deux années pour la même école', () => {
    expect(buildAcademicYearId('s1', '2026', '2027')).not.toBe(buildAcademicYearId('s1', '2027', '2028'));
  });

  it('ne dépend pas du temps ou de l\'aléatoire (déterministe)', () => {
    const id1 = buildAcademicYearId('s1', '2026-09-01', '2027-07-01');
    const id2 = buildAcademicYearId('s1', '2026-09-01', '2027-07-01');
    expect(id1).toBe(id2);
    expect(id1).not.toMatch(/undefined|NaN|null/);
  });

  it('différencie deux évaluations', () => {
    expect(buildEvaluationId('s1', 'ay', 'p1', 'c1', 'csub', 'eval1')).not.toBe(buildEvaluationId('s1', 'ay', 'p1', 'c1', 'csub', 'eval2'));
  });

  it('différencie deux élèves', () => {
    expect(buildGradeId('ev1', 'stu1')).not.toBe(buildGradeId('ev1', 'stu2'));
  });

  it('throw une erreur sur segment vide', () => {
    expect(() => buildAcademicYearId('sch1', '', '')).toThrow();
  });
});
