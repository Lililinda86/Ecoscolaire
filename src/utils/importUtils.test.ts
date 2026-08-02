import { describe, it, expect } from 'vitest';
import { getDefaultFeesForClass } from './importUtils';
import type { School } from '../types';

describe('getDefaultFeesForClass', () => {
  it('1. école sans classFees => null', () => {
    const school: School = { id: 'school-1', name: 'Test' } as School;
    const result = getDefaultFeesForClass('Class 1', 'francophone', school);
    expect(result).toBeNull();
  });

  it('2. école ITALO sans classFees => null', () => {
    const school: School = { id: 'italo-gsb', name: 'ITALO' } as School;
    const result = getDefaultFeesForClass('Class 6', 'anglophone', school);
    expect(result).toBeNull();
  });

  it('3. autre école sans classFees => null', () => {
    const school = { id: 'other', name: 'Other' } as unknown as School;
    const result = getDefaultFeesForClass('Form 1', 'anglophone', school);
    expect(result).toBeNull();
  });

  it('4. école avec configuration => tarifs propres à cette école', () => {
    const mockSchool = {
      id: 'test-school-3',
      name: 'Test School 3',
      classFees: {
        'Class 2': {
          registration: 15000,
          tuition: 90000,
          t1: 50000,
          t2: 40000
        }
      }
    } as unknown as School;
    const result = getDefaultFeesForClass('Class 2', 'francophone', mockSchool);
    expect(result).toEqual({
      registration: 15000,
      tuition: 90000,
      t1: 50000,
      t2: 40000,
      t3: undefined
    });
  });

  it('5. aucune fuite entre deux schoolId', () => {
    const schoolA = {
      id: 'school-A',
      name: 'Ecole A',
      classFees: { 'Class 1': { registration: 10000, tuition: 50000 } }
    } as unknown as School;
    const schoolB = { id: 'school-B', name: 'Ecole B' } as unknown as School;

    expect(getDefaultFeesForClass('Class 1', 'francophone', schoolA)).toEqual({
      registration: 10000,
      tuition: 50000,
      t1: undefined,
      t2: undefined,
      t3: undefined
    });
    expect(getDefaultFeesForClass('Class 1', 'francophone', schoolB)).toBeNull();
  });

  it('6. aucun montant zéro créé pour une valeur absente', () => {
    const school = {
      id: 'school-3',
      classFees: {
        'Class 3': {
          registration: 15000,
          tuition: 60000,
          t1: 30000
        }
      }
    } as unknown as School;
    const result = getDefaultFeesForClass('Class 3', 'francophone', school);
    expect(result?.t2).toBeUndefined(); // Pas 0
    expect(result?.t3).toBeUndefined(); // Pas 0
  });
});
