import { test, expect } from '@playwright/test';
import { DEFAULT_CLASS_LEVELS } from '../src/constants/defaultClasses';
import { sortClasses } from '../src/utils/sortClasses';
import type { ClassSection } from '../src/types';

test.describe('Predefined Classes Repository tests', () => {
  test('Should contain exactly 48 predefined classes', () => {
    expect(DEFAULT_CLASS_LEVELS.length).toBe(48);
  });

  test('Should have no duplicates in the predefined levels list', () => {
    const names = DEFAULT_CLASS_LEVELS.map(c => `${c.name.toLowerCase()}-${c.section}`);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(DEFAULT_CLASS_LEVELS.length);
  });

  test('Should sort classes correctly using sortClasses utility', () => {
    const mockClasses: ClassSection[] = [
      { id: '1', name: 'CP', type: 'francophone', levelOrder: 6 },
      { id: '2', name: 'SIL', type: 'francophone', levelOrder: 5 },
      { id: '3', name: 'Maternelle 1', type: 'francophone', levelOrder: 2 }
    ];
    const sorted = sortClasses(mockClasses);
    expect(sorted[0].name).toBe('Maternelle 1');
    expect(sorted[1].name).toBe('SIL');
    expect(sorted[2].name).toBe('CP');
  });
});
