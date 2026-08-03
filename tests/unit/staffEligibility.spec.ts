import { describe, it, expect } from 'vitest';
import {
  getEffectiveStaffType,
  getEffectiveEmploymentStatus,
  getStaffDisplayName,
  isStaffEligibleForTeaching
} from '../../src/utils/staffHelpers';
import type { Staff } from '../../src/types';

describe('Staff Model Compatibility & Eligibility', () => {
  const currentSchoolId = 'school-1';

  it('A.1 Fiche canonique - should use canonical fields', () => {
    const staff: Partial<Staff> = {
      firstName: 'Alice',
      lastName: 'Dupont',
      staffType: 'teacher',
      employmentStatus: 'active'
    };
    expect(getStaffDisplayName(staff)).toBe('Dupont Alice');
    expect(getEffectiveStaffType(staff)).toBe('teacher');
    expect(getEffectiveEmploymentStatus(staff)).toBe('active');
  });

  it('A.2 Fiche legacy - should map legacy fields correctly', () => {
    const staff: Partial<Staff> = {
      name: 'Bob Martin',
      role: 'director',
      status: 'actif'
    };
    expect(getStaffDisplayName(staff)).toBe('Bob Martin');
    expect(getEffectiveStaffType(staff)).toBe('director');
    expect(getEffectiveEmploymentStatus(staff)).toBe('active');
  });

  it('A.3 Priorité des champs canoniques sur legacy', () => {
    const staff: Partial<Staff> = {
      firstName: 'Charlie',
      lastName: 'Chaplin',
      name: 'Old Name', // Should be ignored
      staffType: 'secretary',
      role: 'teacher', // Should be ignored
      employmentStatus: 'suspended',
      status: 'actif' // Should be ignored
    };
    expect(getStaffDisplayName(staff)).toBe('Chaplin Charlie');
    expect(getEffectiveStaffType(staff)).toBe('secretary');
    expect(getEffectiveEmploymentStatus(staff)).toBe('suspended');
  });

  it('A.4 Fallback legacy temporaire', () => {
    const staff: Partial<Staff> = {
      active: true,
      position: 'maintenance'
    };
    expect(getEffectiveEmploymentStatus(staff)).toBe('active');
    expect(getEffectiveStaffType(staff)).toBe('maintenance');
  });

  it('C.1 Teacher actif est proposé', () => {
    const staff: Partial<Staff> = { id: 's1', schoolId: currentSchoolId, staffType: 'teacher', employmentStatus: 'active' };
    expect(isStaffEligibleForTeaching(staff, currentSchoolId)).toBe(true);
  });

  it('C.2 Directeur avec teachingEnabled est proposé', () => {
    const staff: Partial<Staff> = { id: 's2', schoolId: currentSchoolId, staffType: 'director', employmentStatus: 'active', teachingEnabled: true };
    expect(isStaffEligibleForTeaching(staff, currentSchoolId)).toBe(true);
  });

  it('C.3 Directeur sans teachingEnabled est exclu', () => {
    const staff: Partial<Staff> = { id: 's3', schoolId: currentSchoolId, staffType: 'director', employmentStatus: 'active' };
    expect(isStaffEligibleForTeaching(staff, currentSchoolId)).toBe(false);
  });

  it('C.4 Inactif, suspendu ou departed sont exclus', () => {
    expect(isStaffEligibleForTeaching({ id: 's4', schoolId: currentSchoolId, staffType: 'teacher', employmentStatus: 'inactive' }, currentSchoolId)).toBe(false);
    expect(isStaffEligibleForTeaching({ id: 's4', schoolId: currentSchoolId, staffType: 'teacher', employmentStatus: 'suspended' }, currentSchoolId)).toBe(false);
    expect(isStaffEligibleForTeaching({ id: 's4', schoolId: currentSchoolId, staffType: 'teacher', employmentStatus: 'departed' }, currentSchoolId)).toBe(false);
  });

  it('C.5 Autre école exclue', () => {
    const staff: Partial<Staff> = { id: 's5', schoolId: 'other-school', staffType: 'teacher', employmentStatus: 'active' };
    expect(isStaffEligibleForTeaching(staff, currentSchoolId)).toBe(false);
  });
});
