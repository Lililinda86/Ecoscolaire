import { test, expect } from '@playwright/test';
import { getStudentLimit, isStudentLimitReached, getStudentLimitLabel } from '../src/utils/saas';
import type { School } from '../src/types';

test.describe('P0-024B Student Limit Helpers Unit Tests', () => {

  const buildSchool = (overrides: Partial<School>): School => {
    return {
      id: 'mock-id',
      schoolCode: 'MOCK',
      name: 'Mock School',
      academicYear: '2023-2024',
      createdAt: new Date().toISOString(),
      ...overrides
    } as School;
  };

  test.describe('1. Tester directement getStudentLimit()', () => {
    test('isInternalSchool = true → Infinity', () => {
      const school = buildSchool({ isInternalSchool: true, subscriptionPlan: 'starter' });
      expect(getStudentLimit(school)).toBe(Infinity);
    });

    test('pilot → 1000', () => {
      const school = buildSchool({ subscriptionPlan: 'pilot' });
      expect(getStudentLimit(school)).toBe(1000);
    });

    test('starter → 200', () => {
      const school = buildSchool({ subscriptionPlan: 'starter' });
      expect(getStudentLimit(school)).toBe(200);
    });

    test('standard → 1000', () => {
      const school = buildSchool({ subscriptionPlan: 'standard' });
      expect(getStudentLimit(school)).toBe(1000);
    });

    test('premium → Infinity', () => {
      const school = buildSchool({ subscriptionPlan: 'premium' });
      expect(getStudentLimit(school)).toBe(Infinity);
    });
  });

  test.describe('2. Tester isStudentLimitReached()', () => {
    test('starter + 199 → false', () => {
      const school = buildSchool({ subscriptionPlan: 'starter' });
      expect(isStudentLimitReached(school, 199)).toBe(false);
    });

    test('starter + 200 → true', () => {
      const school = buildSchool({ subscriptionPlan: 'starter' });
      expect(isStudentLimitReached(school, 200)).toBe(true);
    });

    test('standard + 999 → false', () => {
      const school = buildSchool({ subscriptionPlan: 'standard' });
      expect(isStudentLimitReached(school, 999)).toBe(false);
    });

    test('standard + 1000 → true', () => {
      const school = buildSchool({ subscriptionPlan: 'standard' });
      expect(isStudentLimitReached(school, 1000)).toBe(true);
    });

    test('premium + 1500 → false', () => {
      const school = buildSchool({ subscriptionPlan: 'premium' });
      expect(isStudentLimitReached(school, 1500)).toBe(false);
    });
  });

  test.describe('3. Tester getStudentLimitLabel()', () => {
    test('internal → contient "Illimité"', () => {
      const school = buildSchool({ isInternalSchool: true });
      expect(getStudentLimitLabel(school, 150)).toContain('Illimité');
    });

    test('starter 199 → contient "199 / 200"', () => {
      const school = buildSchool({ subscriptionPlan: 'starter' });
      expect(getStudentLimitLabel(school, 199)).toContain('199 / 200');
    });

    test('pilot 999 → contient "999 / 1000"', () => {
      const school = buildSchool({ subscriptionPlan: 'pilot' });
      expect(getStudentLimitLabel(school, 999)).toContain('999 / 1000');
    });
  });
});
