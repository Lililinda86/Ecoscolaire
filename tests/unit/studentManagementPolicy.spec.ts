import { describe, expect, it } from 'vitest';
import {
  canRoleChangeStudentStatus,
  canRoleManageStudents,
  getStudentCreationErrorMessage,
  getStudentStatusErrorMessage,
  validateRequiredStudentFields
} from '../../src/services/studentManagementPolicy';

const validStudent = {
  studentLastName: 'Test',
  studentFirstName: 'Élève',
  gender: 'F' as const,
  dob: '2018-01-02',
  classId: 'class-1',
  parentName: 'Parent Test',
  parentPhone: '600000000'
};

describe('student management policy', () => {
  for (const role of ['superAdmin', 'owner', 'director', 'secretary']) {
    it(`${role} can manage students and change active status`, () => {
      expect(canRoleManageStudents(role)).toBe(true);
      expect(canRoleChangeStudentStatus(role)).toBe(true);
    });
  }

  for (const role of ['teacher', 'accountant', 'boardViewer']) {
    it(`${role} cannot manage students`, () => {
      expect(canRoleManageStudents(role)).toBe(false);
      expect(canRoleChangeStudentStatus(role)).toBe(false);
    });
  }

  it('accepts the minimum required creation fields without medical data', () => {
    expect(validateRequiredStudentFields(validStudent)).toBeNull();
  });

  it('accepts each optional medical variant independently', () => {
    expect(validateRequiredStudentFields({ ...validStudent, allergies: 'Arachides' })).toBeNull();
    expect(validateRequiredStudentFields({ ...validStudent, medicalConditions: 'Asthme' })).toBeNull();
    expect(validateRequiredStudentFields({ ...validStudent, allergies: '', medicalConditions: '' })).toBeNull();
  });

  for (const [field, expected] of [
    ['studentLastName', 'nom'],
    ['studentFirstName', 'prénoms'],
    ['gender', 'sexe'],
    ['dob', 'date de naissance'],
    ['classId', 'classe'],
    ['parentName', 'responsable légal'],
    ['parentPhone', 'téléphone']
  ] as const) {
    it(`blocks creation when ${field} is missing`, () => {
      expect(validateRequiredStudentFields({ ...validStudent, [field]: '' })).toContain(expected);
    });
  }

  it('blocks a whitespace-only first name', () => {
    expect(validateRequiredStudentFields({ ...validStudent, studentFirstName: '   ' })).toContain('prénoms');
  });

  it('blocks a future birth date', () => {
    expect(validateRequiredStudentFields(
      { ...validStudent, dob: '2030-01-01' },
      new Date('2026-01-01T12:00:00')
    )).toContain('futur');
  });

  for (const code of [
    'UNAUTHENTICATED',
    'PERMISSION_DENIED',
    'STUDENT_COUNTER_NOT_INITIALIZED',
    'STUDENT_QUOTA_REACHED',
    'MATRICULE_ALREADY_EXISTS',
    'INVALID_ACADEMIC_YEAR',
    'INVALID_CLASS'
  ]) {
    it(`maps ${code} to a safe user message`, () => {
      const message = getStudentCreationErrorMessage(code);
      expect(message).toBeTruthy();
      expect(message).not.toContain(code);
    });
  }

  it('maps a full-quota reactivation to a clear non-technical message', () => {
    const message = getStudentStatusErrorMessage('STUDENT_QUOTA_REACHED');
    expect(message).toContain('capacité');
    expect(message).not.toContain('STUDENT_QUOTA_REACHED');
  });
});
