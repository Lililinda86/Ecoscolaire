import { describe, it, expect } from 'vitest';
import { deduplicateAcademicYears } from '../../src/utils/academicYearDeduplication';
import type { AcademicYear } from '../../src/types';

describe('academicYearDeduplication', () => {
  it('exclut les années d\'une autre école', () => {
    const years = [
      { id: '1', schoolId: 'school_1', startDate: '2026-01-01', endDate: '2026-12-31' },
      { id: '2', schoolId: 'school_2', startDate: '2026-01-01', endDate: '2026-12-31' },
    ] as AcademicYear[];
    
    const result = deduplicateAcademicYears(years, 'school_1', undefined);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('déduplique les références strictes du même ID de document', () => {
    const years = [
      { id: '1', schoolId: 'school_1', startDate: '2026-01-01', endDate: '2026-12-31' },
      { id: '1', schoolId: 'school_1', startDate: '2026-01-01', endDate: '2026-12-31' },
    ] as AcademicYear[];
    
    const result = deduplicateAcademicYears(years, 'school_1', undefined);
    expect(result).toHaveLength(1);
  });

  it('conserve l\'année active si mêmes bornes avec deux IDs différents', () => {
    const years = [
      { id: '1', schoolId: 'school_1', startDate: '2026-01-01', endDate: '2026-12-31', status: 'draft' },
      { id: '2', schoolId: 'school_1', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active' },
      { id: '3', schoolId: 'school_1', startDate: '2026-01-01', endDate: '2026-12-31', status: 'archived' },
    ] as AcademicYear[];
    
    const result = deduplicateAcademicYears(years, 'school_1', '2');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('priorise l\'activeAcademicYearId même si une autre est active', () => {
    const years = [
      { id: '1', schoolId: 'school_1', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active' },
      { id: '2', schoolId: 'school_1', startDate: '2026-01-01', endDate: '2026-12-31', status: 'draft' },
    ] as AcademicYear[];
    
    const result = deduplicateAcademicYears(years, 'school_1', '2');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('conserve les deux années si elles portent le même nom mais des dates différentes', () => {
    const years = [
      { id: '1', schoolId: 'school_1', name: '2026-2027', startDate: '2026-01-01', endDate: '2026-12-31' },
      { id: '2', schoolId: 'school_1', name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' },
    ] as AcademicYear[];
    
    const result = deduplicateAcademicYears(years, 'school_1', undefined);
    expect(result).toHaveLength(2);
  });

  it('ne mute pas le tableau source et trie par startDate décroissante', () => {
    const years = [
      { id: 'old', schoolId: 'school_1', startDate: '2025-01-01', endDate: '2025-12-31' },
      { id: 'new', schoolId: 'school_1', startDate: '2026-01-01', endDate: '2026-12-31' },
    ] as AcademicYear[];
    
    const yearsCopy = [...years];
    const result = deduplicateAcademicYears(years, 'school_1', undefined);
    
    expect(years).toEqual(yearsCopy); // Non muté
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('new'); // Tri décroissant
    expect(result[1].id).toBe('old');
  });
});
