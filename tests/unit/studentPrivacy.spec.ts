import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Student } from '../../src/types';
import {
  canLoadStudentFinance,
  canLoadStudentParentFinance,
  canLoadStudentParentPrivate,
  canLoadStudentPrivate,
  canUseStudentContactWhatsApp,
  mergeStudentRestrictedData,
  splitStudentData
} from '../../src/services/studentPrivacy';

const student = {
  id: 'student-1',
  schoolId: 'school-1',
  name: 'Élève Test',
  studentLastName: 'Élève',
  studentFirstName: 'Test',
  gender: 'F',
  dob: '2018-01-02',
  section: 'francophone',
  classId: 'class-1',
  parentName: 'Parent Test',
  parentPhone: '+237600000000',
  parentEmails: ['parent@example.test'],
  allergies: 'Fictif',
  registrationFeePaid: 0,
  registrationFeeStatus: 'unpaid',
  feeT1: 1000,
  feeT2: 2000,
  feeT3: 3000,
  financialBypass: { t1: true, t2: false, t3: false },
  usesTransport: true
} as Student;

describe('student privacy separation', () => {
  it('separates school, private and financial fields', () => {
    const result = splitStudentData(student as Student & { schoolId: string });
    expect(result.schoolData).toMatchObject({
      id: 'student-1',
      name: 'Élève Test',
      classId: 'class-1',
      usesTransport: true
    });
    expect(result.schoolData).not.toHaveProperty('parentPhone');
    expect(result.schoolData).not.toHaveProperty('allergies');
    expect(result.schoolData).not.toHaveProperty('registrationFeePaid');
    expect(result.schoolData).not.toHaveProperty('feeT1');
    expect(result.schoolData).not.toHaveProperty('financialBypass');
    expect(result.privateData).toMatchObject({
      studentId: 'student-1',
      parentPhone: '+237600000000',
      allergies: 'Fictif'
    });
    expect(result.financeData).toMatchObject({
      studentId: 'student-1',
      registrationFeePaid: 0,
      registrationFeeStatus: 'unpaid'
    });
    expect(result.parentPrivateData).toEqual({
      id: 'student-1', schoolId: 'school-1', studentId: 'student-1', dob: '2018-01-02'
    });
    expect(result.parentFinanceData).toMatchObject({
      studentId: 'student-1', feeT1: 1000, feeT2: 2000, feeT3: 3000,
      financialBypass: { t1: true, t2: false, t3: false }
    });
  });

  it('loads restricted collections only for roles with a demonstrated need', () => {
    expect(canLoadStudentPrivate('owner')).toBe(true);
    expect(canLoadStudentPrivate('secretary')).toBe(true);
    expect(canLoadStudentPrivate('parent')).toBe(false);
    expect(canLoadStudentPrivate('teacher')).toBe(false);
    expect(canLoadStudentPrivate('accountant')).toBe(false);
    expect(canLoadStudentPrivate('boardViewer')).toBe(false);
    expect(canLoadStudentPrivate('driver')).toBe(false);

    expect(canLoadStudentFinance('accountant')).toBe(true);
    expect(canLoadStudentFinance('parent')).toBe(false);
    expect(canLoadStudentFinance('teacher')).toBe(false);
    expect(canLoadStudentFinance('boardViewer')).toBe(false);
    expect(canLoadStudentParentPrivate('parent')).toBe(true);
    expect(canLoadStudentParentPrivate('owner')).toBe(false);
    expect(canLoadStudentParentFinance('parent')).toBe(true);
    expect(canLoadStudentParentFinance('accountant')).toBe(false);
    expect(canUseStudentContactWhatsApp('owner')).toBe(true);
    expect(canUseStudentContactWhatsApp('director')).toBe(true);
    expect(canUseStudentContactWhatsApp('secretary')).toBe(true);
    expect(canUseStudentContactWhatsApp('accountant')).toBe(false);
  });

  it('merges only records that were conditionally loaded', () => {
    const schoolOnly = { ...student };
    delete schoolOnly.parentPhone;
    delete schoolOnly.registrationFeePaid;
    const privateRecord = {
      id: student.id,
      studentId: student.id,
      schoolId: student.schoolId || '',
      parentPhone: student.parentPhone
    };
    expect(mergeStudentRestrictedData([schoolOnly], [], [])[0].parentPhone).toBeUndefined();
    expect(mergeStudentRestrictedData([schoolOnly], [privateRecord], [])[0].parentPhone).toBe(student.parentPhone);
  });

  it('refreshes post-payment finance from the canonical projection', () => {
    const stalePublicStudent = {
      ...student,
      tuitionPaid: 1000,
      tuitionStatus: 'partial'
    } as Student;
    const canonicalFinance = {
      id: student.id,
      studentId: student.id,
      schoolId: student.schoolId || '',
      tuitionPaid: 6000,
      tuitionStatus: 'paid'
    } as const;

    const refreshedStudent = mergeStudentRestrictedData(
      [stalePublicStudent],
      [],
      [canonicalFinance]
    )[0];

    expect(refreshedStudent).toMatchObject({
      tuitionPaid: 6000,
      tuitionStatus: 'paid'
    });

    const paymentsSource = readFileSync('src/pages/Payments.tsx', 'utf8');
    expect(paymentsSource).toContain("doc(firestoreDb, 'studentFinance', currentPayment.studentId)");
    expect(paymentsSource).toContain('mergeStudentRestrictedData([publicStudent], [], financeRecords)');
  });

  it('keeps a legacy public student readable when its finance projection is absent', () => {
    const publicStudent = { ...student };
    delete publicStudent.registrationFeePaid;
    delete publicStudent.registrationFeeStatus;

    expect(() => mergeStudentRestrictedData([publicStudent], [], [])).not.toThrow();
    expect(mergeStudentRestrictedData([publicStudent], [], [])[0]).toMatchObject({
      id: student.id,
      schoolId: student.schoolId,
      name: student.name
    });
  });

  it('does not retain student PII debug logs in Students or AppContext', () => {
    const sources = [
      readFileSync('src/pages/Students.tsx', 'utf8'),
      readFileSync('src/context/AppContext.tsx', 'utf8')
    ].join('\n');
    expect(sources).not.toMatch(/DEBUG STUDENTS|Name:\s*\$\{|console\.(?:log|info|warn|error)\([^\n]*(?:parentPhone|parentEmails|allergies|medicalConditions)/);
  });
});
