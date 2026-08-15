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
  doc: vi.fn((...args: unknown[]) => args.slice(1).join('/')),
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

  it('creates both parent projections inside the same student transaction', async () => {
    const writes: string[] = [];
    const updates: Array<[string, Record<string, unknown>]> = [];
    vi.mocked(runTransaction).mockImplementationOnce(async (_firestore, callback) => callback({
      get: vi.fn(async (reference: string) => reference === 'schools/school-a'
        ? { exists: () => true, data: () => ({ studentsCount: 0, subscriptionPlan: 'starter' }) }
        : { exists: () => false }),
      set: vi.fn((reference: unknown) => writes.push(String(reference))),
      update: vi.fn((reference: string, data: Record<string, unknown>) => updates.push([reference, data]))
    } as never));

    await createStudentAtomically({
      firestore: {} as Firestore,
      studentId: 'student-atomic-1',
      schoolId: 'school-a',
      actorId: 'owner-a',
      requestedMatricule: 'MAT-2026-4001',
      studentData: {
        studentLastName: 'Élève', studentFirstName: 'Atomique', gender: 'F'
      },
      privateData: { dob: '2018-01-02' },
      financeData: { feeT1: 1000, feeT2: 2000, feeT3: 3000 },
      parentPrivateData: { dob: '2018-01-02' },
      parentFinanceData: {
        feeT1: 1000, feeT2: 2000, feeT3: 3000,
        financialBypass: { t1: false, t2: false, t3: false }
      }
    });

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(writes).toEqual(expect.arrayContaining([
      'students/student-atomic-1',
      'studentPrivate/student-atomic-1',
      'studentFinance/student-atomic-1',
      'studentParentPrivate/student-atomic-1',
      'studentParentFinance/student-atomic-1'
    ]));
    expect(updates).toContainEqual([
      'schools/school-a',
      expect.objectContaining({ studentsCount: 1, lastStudentCounterMutationType: 'create' })
    ]);
  });

  it('rejects an uninitialized canonical counter without using legacy studentCount', async () => {
    const set = vi.fn();
    const update = vi.fn();
    vi.mocked(runTransaction).mockImplementationOnce(async (_firestore, callback) => callback({
      get: vi.fn(async (reference: string) => reference === 'schools/school-a'
        ? { exists: () => true, data: () => ({ studentCount: 12, subscriptionPlan: 'starter' }) }
        : { exists: () => false }),
      set,
      update
    } as never));

    await expect(createStudentAtomically({
      firestore: {} as Firestore,
      studentId: 'student-no-counter',
      schoolId: 'school-a',
      actorId: 'owner-a',
      requestedMatricule: 'MAT-2026-4002',
      studentData: { studentLastName: 'No', studentFirstName: 'Counter', gender: 'M' },
      privateData: { dob: '2018-01-02' },
      financeData: {}, parentPrivateData: {}, parentFinanceData: {}
    })).rejects.toThrow('STUDENT_COUNTER_NOT_INITIALIZED');
    expect(set).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a full quota before creating any document or incrementing the counter', async () => {
    const set = vi.fn();
    const update = vi.fn();
    vi.mocked(runTransaction).mockImplementationOnce(async (_firestore, callback) => callback({
      get: vi.fn(async (reference: string) => reference === 'schools/school-a'
        ? { exists: () => true, data: () => ({ studentsCount: 2, studentLimit: 2, subscriptionPlan: 'starter' }) }
        : { exists: () => false }),
      set,
      update
    } as never));

    await expect(createStudentAtomically({
      firestore: {} as Firestore,
      studentId: 'student-quota-full',
      schoolId: 'school-a',
      actorId: 'owner-a',
      requestedMatricule: 'MAT-2026-4003',
      studentData: { studentLastName: 'Quota', studentFirstName: 'Full', gender: 'F' },
      privateData: { dob: '2018-01-02' },
      financeData: {}, parentPrivateData: {}, parentFinanceData: {}
    })).rejects.toThrow('STUDENT_QUOTA_REACHED');
    expect(set).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
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
      privateData: {},
      financeData: {},
      parentPrivateData: {},
      parentFinanceData: {},
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
      privateData: {},
      financeData: {},
      parentPrivateData: {},
      parentFinanceData: {},
      generateMatricule: attempt => `MAT-2026-300${attempt + 1}`,
      isMatriculeKnown: matricule => matricule === 'MAT-2026-3001'
    });

    expect(runTransactionMock).toHaveBeenCalledTimes(1);
  });
});
