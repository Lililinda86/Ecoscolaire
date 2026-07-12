import { test, expect } from '@playwright/test';
import { normalizeCameroonPhoneNumber, normalizeClassName } from '../src/utils/importUtils';

test.describe('Excel/CSV Import Normalization & Validation Helpers', () => {
  test('PhoneNumber Normalization checks', () => {
    // Cameroon phone standard: +237XXXXXXXXX
    expect(normalizeCameroonPhoneNumber('650336558')).toBe('+237650336558');
    expect(normalizeCameroonPhoneNumber('237650336558')).toBe('+237650336558');
    expect(normalizeCameroonPhoneNumber('+237650336558')).toBe('+237650336558');
    expect(normalizeCameroonPhoneNumber('00237650336558')).toBe('+237650336558');
    
    // Invalid phone numbers should return null
    expect(normalizeCameroonPhoneNumber('12345')).toBeNull();
    expect(normalizeCameroonPhoneNumber('abcdefghi')).toBeNull();
  });

  test('ClassName Normalization checks', () => {
    // Exact mapping matches
    expect(normalizeClassName('Pre nursery')?.matchedName).toBe('Pre-Nursery');
    expect(normalizeClassName('Pré maternelle')?.matchedName).toBe('Pré-maternelle');
    expect(normalizeClassName('Cm2')?.matchedName).toBe('CM2');
    expect(normalizeClassName('Class six')?.matchedName).toBe('Class 6');
    expect(normalizeClassName('6eme technique')?.matchedName).toBe('6ème technique');
    expect(normalizeClassName('5eme technique')?.matchedName).toBe('5ème technique');
    
    // Correction suggestion mapping
    const matchForm1 = normalizeClassName('From 1');
    expect(matchForm1?.matchedName).toBe('Form 1');
    expect(matchForm1?.suggestion).toBe('Form 1');
  });
});
