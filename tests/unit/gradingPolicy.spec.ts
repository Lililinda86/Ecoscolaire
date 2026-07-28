import { describe, test, expect } from 'vitest';
import { getMention, validateGradingPolicy, getDefaultGradingPolicy } from '../../src/services/gradingPolicy';

describe('gradingPolicy service', () => {
  test('getMention retourne la bonne mention', () => {
    expect(getMention(18)).toBe('Excellent');
    expect(getMention(16)).toBe('Très bien');
    expect(getMention(14)).toBe('Bien');
    expect(getMention(12)).toBe('Assez bien');
    expect(getMention(10)).toBe('Passable');
    expect(getMention(9)).toBe('Insuffisant');
    expect(getMention(null)).toBe('-');
  });

  test('validateGradingPolicy valide la politique', () => {
    expect(validateGradingPolicy({ defaultMaxScore: 20 })).toBe(true);
    expect(validateGradingPolicy({ defaultMaxScore: 0 })).toBe(false);
    expect(validateGradingPolicy({ defaultMaxScore: -5 })).toBe(false);
  });

  test('getDefaultGradingPolicy retourne la politique par défaut', () => {
    const policy = getDefaultGradingPolicy();
    expect(policy.defaultMaxScore).toBe(20);
  });
});
