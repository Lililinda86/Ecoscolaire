import { describe, it, expect } from 'vitest';
import { upsertCanonicalAcademicYears } from '../../src/context/AppContext';
import { AcademicYear } from '../../src/types';

describe('AppContext - upsertCanonicalAcademicYears', () => {
  it('merges partial updates securely without losing initial properties', () => {
    const initialState: AcademicYear[] = [
      {
        id: 'ay_1',
        schoolId: 'sch_1',
        name: '2026-2027',
        startDate: '2026-09-05',
        endDate: '2027-06-30',
        status: 'active',
        version: 1,
        createdAt: 'date',
        createdBy: 'user',
        updatedAt: 'date',
        updatedBy: 'user'
      },
      {
        id: 'ay_2',
        schoolId: 'sch_1',
        name: '2025-2026',
        startDate: '2025-09-05',
        endDate: '2026-06-30',
        status: 'closed',
        version: 1,
        createdAt: 'date',
        createdBy: 'user',
        updatedAt: 'date',
        updatedBy: 'user'
      }
    ];

    const updates = [
      {
        id: 'ay_1',
        version: 2,
        name: undefined // une propriété undefined n’écrase pas la valeur existante
      }
    ];

    const result = upsertCanonicalAcademicYears(initialState, updates);

    expect(result).not.toBe(initialState);
    expect(result[0]).not.toBe(initialState[0]);
    expect(initialState[0].version).toBe(1);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('ay_1');
    expect(result[0].status).toBe('active'); // status reste active
    expect(result[0].name).toBe('2026-2027'); // name reste inchangé
    expect(result[0].startDate).toBe('2026-09-05'); // startDate reste inchangée
    expect(result[0].endDate).toBe('2027-06-30'); // endDate reste inchangée
    expect(result[0].schoolId).toBe('sch_1'); // schoolId reste inchangé
    expect(result[0].version).toBe(2); // version est mise à jour

    // les autres années restent inchangées
    expect(result[1].id).toBe('ay_2');
    expect(result[1].version).toBe(1);

    // l’ordre du tableau reste inchangé
    expect(result[0].id).toBe('ay_1');
    expect(result[1].id).toBe('ay_2');
  });

  it('adds a new complete academic year to the end of the list', () => {
    const initialState: AcademicYear[] = [];
    const completeYear: AcademicYear = {
      id: 'ay_new',
      schoolId: 'sch_1',
      name: '2027-2028',
      startDate: '2027-09-05',
      endDate: '2028-06-30',
      status: 'draft',
      createdAt: 'date',
      createdBy: 'user',
      updatedAt: 'date',
      updatedBy: 'user'
    };

    const result = upsertCanonicalAcademicYears(initialState, [completeYear]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(completeYear);
  });

  it('rejects a new academic year if a required field is explicitly undefined', () => {
    const initialState: AcademicYear[] = [];
    const incompleteYear: AcademicYear = {
      id: 'ay_invalid',
      schoolId: 'sch_1',
      name: '2026-2027',
      startDate: '2026-09-05',
      endDate: '2027-06-30',
      status: 'active',
      createdAt: 'date',
      createdBy: 'user',
      updatedAt: 'date',
      updatedBy: 'user'
    };
    Object.defineProperty(incompleteYear, 'name', { value: undefined });
    const result = upsertCanonicalAcademicYears(initialState, [incompleteYear]);
    expect(result).toHaveLength(0);
  });

  it('does not append an incomplete object if id is unknown', () => {
    const initialState: AcademicYear[] = [];
    const updates = [
      {
        id: 'ay_unknown',
        version: 2
      }
    ];

    const result = upsertCanonicalAcademicYears(initialState, updates);
    expect(result).toHaveLength(0); // un patch partiel avec id inconnu n’est pas ajouté
  });
});
