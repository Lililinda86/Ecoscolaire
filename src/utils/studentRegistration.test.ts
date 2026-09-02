import { describe, expect, it } from 'vitest';
import {
  getEffectiveRegistrationFile,
  getMissingStrictCreationFields,
  getRegistrationFileFields
} from './studentRegistration';

const minimalStudent = {
  id: 'student-1', schoolId: 'school-1', name: 'N’GONO Élise',
  studentLastName: 'N’GONO', studentFirstName: 'Élise', gender: 'F' as const,
  section: 'francophone' as const, classId: 'class-1', registrationYear: '2026-2027'
};

const completeStudent = {
  ...minimalStudent,
  dob: '2018-04-12',
  placeOfBirth: 'Douala',
  parentName: 'Paul N’GONO',
  parentPhone: '237650000000',
  address: 'Akwa',
  emergencyContact: '237690000000',
  noKnownMedicalCondition: true
};

describe('progressive student registration', () => {
  it('accepts a minimal student and marks the file incomplete', () => {
    expect(getMissingStrictCreationFields(minimalStudent)).toEqual([]);
    expect(getEffectiveRegistrationFile(minimalStudent)).toEqual({
      status: 'incomplete',
      missingFields: ['dob', 'placeOfBirth', 'parentName', 'parentPhone', 'address', 'emergencyContact', 'medicalInformation']
    });
  });

  it('marks a fully documented registration as complete', () => {
    expect(getEffectiveRegistrationFile(completeStudent)).toEqual({ status: 'complete', missingFields: [] });
  });

  it('moves from incomplete to complete after completion', () => {
    expect(getEffectiveRegistrationFile(minimalStudent).status).toBe('incomplete');
    expect(getEffectiveRegistrationFile(completeStudent).status).toBe('complete');
  });

  it('moves from complete to incomplete when expected information is removed', () => {
    expect(getEffectiveRegistrationFile(completeStudent).status).toBe('complete');
    expect(getEffectiveRegistrationFile({ ...completeStudent, address: '' })).toEqual({
      status: 'incomplete',
      missingFields: ['address']
    });
  });

  it('keeps requested transport incomplete without inventing a zone, point, or fare', () => {
    const result = getEffectiveRegistrationFile({ ...completeStudent, usesTransport: true });
    expect(result).toEqual({
      status: 'incomplete',
      missingFields: ['transportNeighborhood', 'transportPickupPoint']
    });
  });

  it('calculates a safe status for a legacy student without stored registration fields', () => {
    const legacyStudent = { ...completeStudent };
    expect(legacyStudent).not.toHaveProperty('registrationFileStatus');
    expect(getEffectiveRegistrationFile(legacyStudent)).toEqual({ status: 'complete', missingFields: [] });
  });

  it('builds persisted registration fields for an incomplete Excel import', () => {
    expect(getRegistrationFileFields(minimalStudent)).toEqual({
      registrationFileStatus: 'incomplete',
      missingRegistrationFields: ['dob', 'placeOfBirth', 'parentName', 'parentPhone', 'address', 'emergencyContact', 'medicalInformation']
    });
  });

  it('rejects a genuinely required creation field when absent', () => {
    expect(getMissingStrictCreationFields({ ...minimalStudent, classId: '' })).toContain('classId');
  });
});
