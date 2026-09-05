import { describe, expect, it } from 'vitest';
import {
  getDisplayClassName,
  getClassOptionLabel,
  normalizeFrancophoneMaternelleLevel
} from './classCatalog';
import { sortClasses } from './sortClasses';
import type { ClassSection } from '../types';

describe('francophone maternelle class compatibility', () => {
  it.each([
    ['Maternelle 1', 'fr-preschool-ps'],
    ['Petite Section', 'fr-preschool-ps'],
    ['Petite section', 'fr-preschool-ps'],
    ['Maternelle 2', 'fr-preschool-ms'],
    ['Moyenne Section', 'fr-preschool-ms'],
    ['Moyenne section', 'fr-preschool-ms'],
    ['Maternelle 3', 'fr-preschool-gs'],
    ['Grande Section', 'fr-preschool-gs'],
    ['Grande section', 'fr-preschool-gs']
  ])('normalizes %s to %s', (name, expectedLevelId) => {
    expect(normalizeFrancophoneMaternelleLevel(name)).toBe(expectedLevelId);
  });

  it.each([
    ['Maternelle 1', 'Maternelle Petite Section'],
    ['Petite Section', 'Maternelle Petite Section'],
    ['Maternelle 2', 'Maternelle Moyenne Section'],
    ['Moyenne Section', 'Maternelle Moyenne Section'],
    ['Maternelle 3', 'Maternelle Grande Section'],
    ['Grande Section', 'Maternelle Grande Section']
  ])('displays %s as %s', (storedName, expectedDisplayName) => {
    expect(getDisplayClassName(storedName)).toBe(expectedDisplayName);
  });

  it('does not mutate class identity or classFees data', () => {
    const classRecord = { id: 'stable-class-id', name: 'Maternelle 1' };
    const classFees: Record<string, {
      registration: number;
      tuition: number;
      t1: number;
      t2: number;
      t3: number;
    }> = {
      'Maternelle 1': { registration: 10_000, tuition: 90_000, t1: 40_000, t2: 30_000, t3: 20_000 }
    };
    const before = JSON.stringify({ classRecord, classFees });

    expect(getDisplayClassName(classRecord.name)).toBe('Maternelle Petite Section');
    expect(classRecord.id).toBe('stable-class-id');
    expect(classFees[classRecord.name]).toEqual({
      registration: 10_000,
      tuition: 90_000,
      t1: 40_000,
      t2: 30_000,
      t3: 20_000
    });
    expect(JSON.stringify({ classRecord, classFees })).toBe(before);
  });

  it('keeps the requested pedagogical display order for legacy values', () => {
    const classes: ClassSection[] = [
      { id: 'cp', name: 'CP', type: 'francophone' },
      { id: 'gs', name: 'Maternelle 3', type: 'francophone' },
      { id: 'pre', name: 'Pré-maternelle', type: 'francophone' },
      { id: 'sil', name: 'SIL', type: 'francophone' },
      { id: 'ps', name: 'Petite section', type: 'francophone' },
      { id: 'ms', name: 'Maternelle Moyenne Section', type: 'francophone' }
    ];

    expect(sortClasses(classes).map(cls => getDisplayClassName(cls.name))).toEqual([
      'Pré-maternelle',
      'Maternelle Petite Section',
      'Maternelle Moyenne Section',
      'Maternelle Grande Section',
      'SIL',
      'CP'
    ]);
  });
});

describe('getClassOptionLabel', () => {
  it('keeps the normalized label simple when it is unique', () => {
    const classItem = { id: 'abc', name: 'Maternelle 1' };

    expect(getClassOptionLabel(classItem, [classItem])).toBe('Maternelle Petite Section');
  });

  it('uses a short stable ID suffix for duplicate display labels', () => {
    const classes = [
      { id: 'abc123456', name: 'Maternelle 1' },
      { id: 'xyz987654', name: 'Petite Section' }
    ];

    expect(classes.map(item => getClassOptionLabel(item, classes))).toEqual([
      'Maternelle Petite Section · 123456',
      'Maternelle Petite Section · 987654'
    ]);
  });

  it('preserves every distinct class ID and option', () => {
    const classes = [
      { id: 'abc123456', name: 'Maternelle 1' },
      { id: 'xyz987654', name: 'Petite Section' }
    ];
    const options = classes.map(item => ({
      value: item.id,
      label: getClassOptionLabel(item, classes)
    }));

    expect(options).toHaveLength(classes.length);
    expect(options.map(option => option.value)).toEqual(classes.map(item => item.id));
    expect(new Set(options.map(option => option.label)).size).toBe(classes.length);
  });
});
