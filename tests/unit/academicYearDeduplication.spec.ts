import { describe, test, expect } from 'vitest';
import { deduplicateAcademicYears, getEquivalentAcademicYearIds } from '../../src/utils/academicYearDeduplication';
import type { AcademicYear } from '../../src/types';

describe('academicYearDeduplication', () => {
  const baseYear: AcademicYear = {
    id: '1',
    schoolId: 'sch-1',
    name: '2026-2027',
    startDate: '2026-09-01',
    endDate: '2027-06-30',
    status: 'planned',
    createdAt: '', createdBy: '', updatedAt: '', updatedBy: ''
  };

  test('exclut les années d\'une autre école', () => {
    const years: AcademicYear[] = [
      { ...baseYear },
      { ...baseYear, id: '2', schoolId: 'sch-2' }
    ];
    const res = deduplicateAcademicYears(years, 'sch-1', undefined);
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('1');
  });

  test('déduplique les références strictes du même ID de document', () => {
    const years: AcademicYear[] = [
      { ...baseYear },
      { ...baseYear }
    ];
    const res = deduplicateAcademicYears(years, 'sch-1', undefined);
    expect(res).toHaveLength(1);
  });

  test('mêmes dates, IDs différents → une année', () => {
    const years: AcademicYear[] = [
      { ...baseYear, id: '1' },
      { ...baseYear, id: '2', name: 'Other Name' }
    ];
    const res = deduplicateAcademicYears(years, 'sch-1', undefined);
    expect(res).toHaveLength(1);
  });

  test('dates valides + dates absentes, même nom → une année', () => {
    const years: AcademicYear[] = [
      { ...baseYear, id: '1' },
      { ...baseYear, id: '2', startDate: '', endDate: '' }
    ];
    const res = deduplicateAcademicYears(years, 'sch-1', undefined);
    expect(res).toHaveLength(1);
    const equiv = getEquivalentAcademicYearIds(years, 'sch-1', '1');
    expect(equiv).toContain('2');
  });

  test('deux dates absentes, même nom → une année', () => {
    const years: AcademicYear[] = [
      { ...baseYear, id: '1', startDate: '', endDate: '' },
      { ...baseYear, id: '2', startDate: '', endDate: '' }
    ];
    const res = deduplicateAcademicYears(years, 'sch-1', undefined);
    expect(res).toHaveLength(1);
    const equiv = getEquivalentAcademicYearIds(years, 'sch-1', '1');
    expect(equiv).toContain('2');
  });

  test('même nom, dates valides contradictoires → deux années', () => {
    const years: AcademicYear[] = [
      { ...baseYear, id: '1', startDate: '2026-09-01' },
      { ...baseYear, id: '2', startDate: '2026-09-02' }
    ];
    const res = deduplicateAcademicYears(years, 'sch-1', undefined);
    expect(res).toHaveLength(2);
    const equiv = getEquivalentAcademicYearIds(years, 'sch-1', '1');
    expect(equiv).not.toContain('2');
  });

  test('activeAcademicYearId prioritaire', () => {
    const years: AcademicYear[] = [
      { ...baseYear, id: '1', status: 'active' },
      { ...baseYear, id: '2', status: 'planned' },
      { ...baseYear, id: '3', status: 'planned' }
    ];
    const res = deduplicateAcademicYears(years, 'sch-1', '3');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('3');
  });

  test('ne mute pas le tableau source et trie par startDate décroissante', () => {
    const y1 = { ...baseYear, id: '1', startDate: '2025-09-01', endDate: '2026-06-30' };
    const y2 = { ...baseYear, id: '2', startDate: '2026-09-01', endDate: '2027-06-30' };
    const years = [y1, y2];
    const res = deduplicateAcademicYears(years, 'sch-1', undefined);
    expect(res).toHaveLength(2);
    expect(res[0].id).toBe('2');
    expect(res[1].id).toBe('1');
    expect(years[0].id).toBe('1');
  });

  test('Permutations: A et C jamais fusionnés, B pas de pont, résultat déterministe', () => {
    const A = { ...baseYear, id: 'A', name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' };
    const B = { ...baseYear, id: 'B', name: '2026-2027', startDate: '', endDate: '' };
    const C = { ...baseYear, id: 'C', name: '2026-2027', startDate: '2027-09-01', endDate: '2028-06-30' };

    const permutations = [
      [A, B, C], [A, C, B], [B, A, C], [B, C, A], [C, A, B], [C, B, A]
    ];

    permutations.forEach(perm => {
      const res = deduplicateAcademicYears(perm, 'sch-1', undefined);
      // A et C are contradictory -> 2 complete groups
      // B should attach to A (first complete group matched? Wait, ambiguous_program if multiple matches)
      // Actually, B matches both A and C because it has the same name and no dates.
      // So B is ambiguous! It should form its own group.
      // Or does it?
      // Our logic: compatibleGroups = finalGroups.filter(...)
      // For B, it matches A (same name, no dates) and C (same name, no dates). So compatibleGroups.length = 2.
      // This is ambiguous! B forms its own group.
      // Thus, deduplicateAcademicYears should return 3 groups for all permutations.
      expect(res).toHaveLength(3);
      
      const ids = res.map(r => r.id).sort();
      expect(ids).toEqual(['A', 'B', 'C']);
    });
  });
});
