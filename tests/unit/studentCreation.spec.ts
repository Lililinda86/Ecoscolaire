import { runTransaction, type Firestore } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStudentDuplicateFingerprint,
  buildStudentDuplicateReservationId,
  buildStudentMatriculeReservationId,
  acquireStudentSubmissionLock,
  generateAutomaticStudentMatricule,
  normalizeStudentMatricule,
  releaseStudentSubmissionLock,
  createStudentAtomically,
  StudentCreationError
} from '../../src/services/studentCreation';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true }))
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('student creation identity helpers', () => {
  it('normalizes matricule casing and spaces deterministically', () => {
    expect(normalizeStudentMatricule('  mat 2026  1001 ')).toBe('MAT-2026-1001');
    expect(normalizeStudentMatricule('Mat-2026-1001')).toBe('MAT-2026-1001');
  });

  it('maps normalized matricules to one same-school reservation id', () => {
    const normalizedA = normalizeStudentMatricule(' mat-2026-1001 ');
    const normalizedB = normalizeStudentMatricule('MAT 2026 1001');
    expect(buildStudentMatriculeReservationId('school-a', normalizedA)).toBe(
      buildStudentMatriculeReservationId('school-a', normalizedB)
    );
  });

  it('builds the same probable duplicate fingerprint across accents and spacing', () => {
    const first = buildStudentDuplicateFingerprint({
      studentLastName: '  Élève ',
      studentFirstName: 'Marie  Claire',
      dob: '2018-01-02',
      gender: 'f'
    });
    const second = buildStudentDuplicateFingerprint({
      studentLastName: 'ELEVE',
      studentFirstName: 'marie claire',
      dob: '2018-01-02',
      gender: 'F'
    });
    expect(first).toBe(second);
    expect(buildStudentDuplicateReservationId('school-a', first)).toBe(`school-a__${second}`);
  });

  it('keeps the automatic matricule format and is stable for a retry', () => {
    const first = generateAutomaticStudentMatricule('student-request-1', 0);
    expect(first).toMatch(/^MAT-2026-\d{4}$/);
    expect(generateAutomaticStudentMatricule('student-request-1', 0)).toBe(first);
  });

  it('provides bounded deterministic alternatives after an automatic collision', () => {
    const candidates = Array.from({ length: 8 }, (_, attempt) =>
      generateAutomaticStudentMatricule('student-request-1', attempt)
    );
    expect(new Set(candidates).size).toBeGreaterThan(1);
  });

  it('allows only one submission while a save is in flight', () => {
    const lock = { current: false };
    expect(acquireStudentSubmissionLock(lock)).toBe(true);
    expect(acquireStudentSubmissionLock(lock)).toBe(false);
    releaseStudentSubmissionLock(lock);
    expect(acquireStudentSubmissionLock(lock)).toBe(true);
  });

  it('retries an automatic collision with a bounded alternative', async () => {
    const runTransactionMock = vi.mocked(runTransaction);
    const successResult = {
      studentId: 'student-request-1',
      matricule: 'MAT-2026-2002',
      matriculeNormalized: 'MAT-2026-2002',
      matriculeReservationId: 'school-a__MAT-2026-2002',
      duplicateFingerprint: 'ELEVE__TEST__2018-01-02__M',
      duplicateReservationId: 'school-a__ELEVE__TEST__2018-01-02__M',
      created: true
    };
    runTransactionMock
      .mockRejectedValueOnce(new StudentCreationError('MATRICULE_ALREADY_EXISTS'))
      .mockResolvedValueOnce(successResult);
    const generateMatricule = vi.fn((attempt: number) => `MAT-2026-200${attempt + 1}`);

    await expect(createStudentAtomically({
      firestore: {} as Firestore,
      studentId: 'student-request-1',
      schoolId: 'school-a',
      actorId: 'owner-a',
      studentData: {
        studentLastName: 'Élève',
        studentFirstName: 'Test',
        dob: '2018-01-02',
        gender: 'M'
      },
      generateMatricule,
      maxAutomaticAttempts: 2
    })).resolves.toEqual(successResult);
    expect(generateMatricule).toHaveBeenNthCalledWith(1, 0);
    expect(generateMatricule).toHaveBeenNthCalledWith(2, 1);
    expect(runTransactionMock).toHaveBeenCalledTimes(2);
  });

  it('skips a legacy matricule already known by the school before reserving', async () => {
    const runTransactionMock = vi.mocked(runTransaction);
    const successResult = {
      studentId: 'student-request-legacy',
      matricule: 'MAT-2026-3002',
      matriculeNormalized: 'MAT-2026-3002',
      matriculeReservationId: 'school-a__MAT-2026-3002',
      duplicateFingerprint: 'ELEVE__LEGACY__2018-01-02__M',
      duplicateReservationId: 'school-a__ELEVE__LEGACY__2018-01-02__M',
      created: true
    };
    runTransactionMock.mockResolvedValueOnce(successResult);

    await createStudentAtomically({
      firestore: {} as Firestore,
      studentId: 'student-request-legacy',
      schoolId: 'school-a',
      actorId: 'owner-a',
      studentData: {
        studentLastName: 'Élève',
        studentFirstName: 'Legacy',
        dob: '2018-01-02',
        gender: 'M'
      },
      generateMatricule: attempt => `MAT-2026-300${attempt + 1}`,
      isMatriculeKnown: matricule => matricule === 'MAT-2026-3001'
    });

    expect(runTransactionMock).toHaveBeenCalledTimes(1);
  });
});
