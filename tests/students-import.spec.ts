import { test, expect } from '@playwright/test';
import { normalizeCameroonPhoneNumber, normalizeClassName, getDefaultFeesForClass } from '../src/utils/importUtils';

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

  test('Secondary vs Primary level registration fees', () => {
    // Primary/Nursery should be 15000
    expect(getDefaultFeesForClass('CM2', 'francophone').registration).toBe(15000);
    expect(getDefaultFeesForClass('Class 6', 'anglophone').registration).toBe(15000);
    expect(getDefaultFeesForClass('Pre-Nursery', 'anglophone').registration).toBe(15000);

    // Secondary general and technical should be 20000
    expect(getDefaultFeesForClass('6ème', 'francophone').registration).toBe(20000);
    expect(getDefaultFeesForClass('5ème', 'francophone').registration).toBe(20000);
    expect(getDefaultFeesForClass('6ème technique', 'francophone').registration).toBe(20000);
    expect(getDefaultFeesForClass('Terminale technique', 'francophone').registration).toBe(20000);
    expect(getDefaultFeesForClass('Form 1', 'anglophone').registration).toBe(20000);
    expect(getDefaultFeesForClass('Form 2', 'anglophone').registration).toBe(20000);
    expect(getDefaultFeesForClass('Technical Form 1', 'anglophone').registration).toBe(20000);
  });
});
