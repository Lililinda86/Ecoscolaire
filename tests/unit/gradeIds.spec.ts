import { describe, it, expect } from 'vitest';
import { buildAcademicYearId, buildEvaluationId, buildGradeId } from '../../src/utils/gradeIds';

describe('Grade IDs Generation', () => {
  it('garantit aucune collision entre A/B et A_B', () => {
    const id1 = buildAcademicYearId('sch1', 'A/B');
    const id2 = buildAcademicYearId('sch1', 'A_B');
    expect(id1).not.toBe(id2);
  });

  it('gère les espaces et caractères spéciaux de façon sécurisée', () => {
    const id = buildAcademicYearId('sch1', 'Année 2026-2027!');
    expect(id).toContain('sch1');
    expect(id).not.toContain(' ');
  });

  it('gère les accents sans casser l\'encodage', () => {
    const id1 = buildAcademicYearId('école', 'trimestre');
    const id2 = buildAcademicYearId('ecole', 'trimestre');
    expect(id1).not.toBe(id2);
  });

  it('différencie deux écoles', () => {
    expect(buildAcademicYearId('s1', 'A')).not.toBe(buildAcademicYearId('s2', 'A'));
  });

  it('différencie deux années', () => {
    expect(buildAcademicYearId('s1', 'A1')).not.toBe(buildAcademicYearId('s1', 'A2'));
  });

  it('différencie deux évaluations', () => {
    expect(buildEvaluationId('s1', 'ay', 'csub', 'eval1')).not.toBe(buildEvaluationId('s1', 'ay', 'csub', 'eval2'));
  });

  it('différencie deux élèves', () => {
    expect(buildGradeId('ev1', 'stu1')).not.toBe(buildGradeId('ev1', 'stu2'));
  });

  it('throw une erreur sur segment vide', () => {
    expect(() => buildAcademicYearId('sch1', '')).toThrow();
  });
});
