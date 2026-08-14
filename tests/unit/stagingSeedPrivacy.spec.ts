import { describe, expect, it, vi } from 'vitest';
import {
  buildStudentSeedDocuments,
  STUDENT_FINANCIAL_FIELDS,
  STUDENT_PRIVATE_FIELDS,
  STUDENT_RESTRICTED_FIELDS,
  writeStudentSeedDocuments
} from '../../scripts/student-seed-data.mjs';

const fixture = () => buildStudentSeedDocuments({
  studentId: 'seed-student-1',
  schoolId: 'school-alpha-001',
  classId: 'alpha-class-cp',
  name: 'Élève Fictif',
  matricule: 'MAT-SEED-001',
  gender: 'F',
  section: 'francophone',
  parentName: 'Responsable Fictif',
  parentPhone: '+237600000000',
  feeT1: 50000,
  feeT2: 0,
  feeT3: 0,
  timestamp: '2026-08-15T00:00:00.000Z'
});

describe('staging student seed privacy', () => {
  it('keeps every known private, medical, parent and financial field out of students', () => {
    const { student } = fixture();

    for (const field of STUDENT_RESTRICTED_FIELDS) {
      expect(student, `students payload contains restricted field ${field}`).not.toHaveProperty(field);
    }
    expect(student).toMatchObject({
      id: 'seed-student-1',
      schoolId: 'school-alpha-001',
      classId: 'alpha-class-cp',
      name: 'Élève Fictif',
      matricule: 'MAT-SEED-001'
    });
  });

  it('routes contacts and fees to identified same-tenant projections', () => {
    const { studentPrivate, studentFinance, studentParentFinance } = fixture();
    const identity = {
      id: 'seed-student-1',
      studentId: 'seed-student-1',
      schoolId: 'school-alpha-001'
    };

    expect(studentPrivate).toMatchObject({
      ...identity,
      parentName: 'Responsable Fictif',
      parentPhone: '+237600000000'
    });
    expect(studentFinance).toMatchObject({ ...identity, feeT1: 50000, feeT2: 0, feeT3: 0 });
    expect(studentParentFinance).toMatchObject({ ...identity, feeT1: 50000, feeT2: 0, feeT3: 0 });

    for (const field of STUDENT_FINANCIAL_FIELDS) expect(studentPrivate).not.toHaveProperty(field);
    for (const field of STUDENT_PRIVATE_FIELDS) {
      expect(studentFinance).not.toHaveProperty(field);
      expect(studentParentFinance).not.toHaveProperty(field);
    }
  });

  it('writes public and projected documents in one batch without merging the public fixture', async () => {
    const set = vi.fn();
    const commit = vi.fn(async () => undefined);
    const db = {
      batch: vi.fn(() => ({ set, commit })),
      collection: vi.fn((collectionName: string) => ({
        doc: vi.fn((studentId: string) => `${collectionName}/${studentId}`)
      }))
    };

    const seedData = {
      studentId: 'seed-student-1',
      schoolId: 'school-alpha-001',
      classId: 'alpha-class-cp',
      name: 'Élève Fictif',
      matricule: 'MAT-SEED-001',
      gender: 'F',
      section: 'francophone',
      parentName: 'Responsable Fictif',
      parentPhone: '+237600000000',
      feeT1: 50000,
      feeT2: 0,
      feeT3: 0,
      timestamp: '2026-08-15T00:00:00.000Z'
    };

    await writeStudentSeedDocuments(db, seedData);

    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(4);
    expect(set).toHaveBeenCalledWith('students/seed-student-1', fixture().student);
    expect(set).toHaveBeenCalledWith(
      'studentPrivate/seed-student-1',
      fixture().studentPrivate,
      { merge: true }
    );
    expect(set).toHaveBeenCalledWith(
      'studentFinance/seed-student-1',
      fixture().studentFinance,
      { merge: true }
    );
    expect(set).toHaveBeenCalledWith(
      'studentParentFinance/seed-student-1',
      fixture().studentParentFinance,
      { merge: true }
    );
  });
});
