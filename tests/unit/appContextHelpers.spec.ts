import { describe, it, expect } from 'vitest';
import { replaceAcademicYearByCanonicalResult } from '../../src/context/AppContext';
import type { AcademicYear } from '../../src/types';

describe('AppContext Helpers - replaceAcademicYearByCanonicalResult', () => {
  it('seule l\'année ciblée est remplacée et l\'ordre du tableau est conservé, autres années inchangées', () => {
    const existingYears: AcademicYear[] = [
      { id: 'ay1', schoolId: 's1', name: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30', status: 'closed' },
      { id: 'ay2', schoolId: 's1', name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'active' },
      { id: 'ay3', schoolId: 's1', name: '2027-2028', startDate: '2027-09-01', endDate: '2028-06-30', status: 'draft' }
    ];

    const result = {
      academicYearId: 'ay2',
      startDate: '2026-08-15',
      endDate: '2027-07-15'
    };

    const updatedYears = replaceAcademicYearByCanonicalResult(existingYears, result);

    expect(updatedYears).toHaveLength(3);
    
    // Ordre conservé
    expect(updatedYears[0].id).toBe('ay1');
    expect(updatedYears[1].id).toBe('ay2');
    expect(updatedYears[2].id).toBe('ay3');

    // Année ciblée remplacée
    expect(updatedYears[1].startDate).toBe('2026-08-15');
    expect(updatedYears[1].endDate).toBe('2027-07-15');

    // Autres années inchangées
    expect(updatedYears[0].startDate).toBe('2025-09-01');
    expect(updatedYears[2].startDate).toBe('2027-09-01');
  });

  it('les autres champs invariants comme le nom, le statut et l\'école sont conservés lors de la mise à jour par le retour canonique', () => {
    const existingYears: AcademicYear[] = [
      { id: 'ay2', schoolId: 's1', name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'active' }
    ];

    const updatedYears = replaceAcademicYearByCanonicalResult(existingYears, {
      academicYearId: 'ay2',
      startDate: '2026-08-15',
      endDate: '2027-07-15'
    });

    expect(updatedYears[0].name).toBe('2026-2027');
    expect(updatedYears[0].status).toBe('active');
    expect(updatedYears[0].schoolId).toBe('s1');
  });

  it('ne modifie rien si l\'année ciblée n\'existe pas (résilience contextuelle)', () => {
    const existingYears: AcademicYear[] = [
      { id: 'ay1', schoolId: 's1', name: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30', status: 'closed' }
    ];

    const updatedYears = replaceAcademicYearByCanonicalResult(existingYears, {
      academicYearId: 'ay-missing',
      startDate: '2026-08-15',
      endDate: '2027-07-15'
    });

    expect(updatedYears).toEqual(existingYears);
  });
});
