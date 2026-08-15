import { runTransaction, type Firestore } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCanonicalStudentCount,
  getConfiguredStudentLimit,
  getStudentCountForDisplay,
  updateStudentSchoolingStatusAtomically
} from '../../src/services/studentQuota';

const transactionGet = vi.fn();
const transactionUpdate = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_firestore, collectionName: string, id: string) => `${collectionName}/${id}`),
  runTransaction: vi.fn(async (_firestore, callback) => callback({
    get: transactionGet,
    update: transactionUpdate
  })),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true }))
}));

const snapshots = ({
  studentsCount = 1,
  schoolingStatus = 'active',
  studentSchoolId = 'school-1',
  subscriptionPlan = 'starter',
  studentLimit
}: {
  studentsCount?: number;
  schoolingStatus?: string;
  studentSchoolId?: string;
  subscriptionPlan?: string;
  studentLimit?: number;
} = {}) => {
  transactionGet.mockImplementation(async (reference: string) => reference === 'schools/school-1'
    ? { exists: () => true, data: () => ({ studentsCount, subscriptionPlan, studentLimit }) }
    : { exists: () => true, data: () => ({ schoolId: studentSchoolId, schoolingStatus }) });
};

beforeEach(() => {
  vi.clearAllMocks();
  snapshots();
});

describe('student active quota counter', () => {
  it('uses studentsCount for security and studentCount only for display compatibility', () => {
    expect(getCanonicalStudentCount({ studentCount: 9 })).toBeNull();
    expect(getStudentCountForDisplay({ studentCount: 9 })).toBe(9);
  });

  it('derives finite and unlimited limits from runtime school configuration', () => {
    expect(getConfiguredStudentLimit({ subscriptionPlan: 'starter' })).toBe(200);
    expect(getConfiguredStudentLimit({ subscriptionPlan: 'starter', studentLimit: 12 })).toBe(12);
    expect(getConfiguredStudentLimit({ subscriptionPlan: 'premium', studentLimit: 1 })).toBe(Infinity);
    expect(getConfiguredStudentLimit({ isInternalSchool: true })).toBe(Infinity);
  });

  it('deactivates and decrements exactly once in one transaction', async () => {
    await expect(updateStudentSchoolingStatusAtomically({
      firestore: {} as Firestore,
      schoolId: 'school-1', studentId: 'student-1', actorId: 'owner-1', targetStatus: 'inactive'
    })).resolves.toBe('updated');
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(transactionUpdate).toHaveBeenCalledWith('schools/school-1', expect.objectContaining({
      studentsCount: 0, lastStudentCounterMutationType: 'deactivate'
    }));
    expect(transactionUpdate).toHaveBeenCalledWith('students/student-1', expect.objectContaining({ schoolingStatus: 'inactive' }));
  });

  it('does not double-decrement an already inactive student', async () => {
    snapshots({ schoolingStatus: 'inactive', studentsCount: 0 });
    await expect(updateStudentSchoolingStatusAtomically({
      firestore: {} as Firestore,
      schoolId: 'school-1', studentId: 'student-1', actorId: 'owner-1', targetStatus: 'inactive'
    })).resolves.toBe('unchanged');
    expect(transactionUpdate).not.toHaveBeenCalled();
  });

  it('reactivates with capacity and increments exactly once', async () => {
    snapshots({ schoolingStatus: 'inactive', studentsCount: 1, studentLimit: 2 });
    await expect(updateStudentSchoolingStatusAtomically({
      firestore: {} as Firestore,
      schoolId: 'school-1', studentId: 'student-1', actorId: 'owner-1', targetStatus: 'active'
    })).resolves.toBe('updated');
    expect(transactionUpdate).toHaveBeenCalledWith('schools/school-1', expect.objectContaining({
      studentsCount: 2, lastStudentCounterMutationType: 'reactivate'
    }));
  });

  it('does not double-increment an already active student', async () => {
    snapshots({ schoolingStatus: 'active', studentsCount: 2, studentLimit: 3 });
    await expect(updateStudentSchoolingStatusAtomically({
      firestore: {} as Firestore,
      schoolId: 'school-1', studentId: 'student-1', actorId: 'owner-1', targetStatus: 'active'
    })).resolves.toBe('unchanged');
    expect(transactionUpdate).not.toHaveBeenCalled();
  });

  it('leaves the counter unchanged for an ordinary student update', () => {
    const school = { studentsCount: 4, studentCount: 99 };
    expect(getCanonicalStudentCount(school)).toBe(4);
    expect(getStudentCountForDisplay(school)).toBe(4);
  });

  it('denies reactivation at quota and never writes', async () => {
    snapshots({ schoolingStatus: 'inactive', studentsCount: 2, studentLimit: 2 });
    await expect(updateStudentSchoolingStatusAtomically({
      firestore: {} as Firestore,
      schoolId: 'school-1', studentId: 'student-1', actorId: 'owner-1', targetStatus: 'active'
    })).rejects.toThrow('STUDENT_QUOTA_REACHED');
    expect(transactionUpdate).not.toHaveBeenCalled();
  });

  it('never decrements below zero and rejects cross-school mutations', async () => {
    snapshots({ schoolingStatus: 'active', studentsCount: 0 });
    await expect(updateStudentSchoolingStatusAtomically({
      firestore: {} as Firestore,
      schoolId: 'school-1', studentId: 'student-1', actorId: 'owner-1', targetStatus: 'inactive'
    })).rejects.toThrow('STUDENT_COUNTER_INCONSISTENT');
    snapshots({ studentSchoolId: 'school-2' });
    await expect(updateStudentSchoolingStatusAtomically({
      firestore: {} as Firestore,
      schoolId: 'school-1', studentId: 'student-1', actorId: 'owner-1', targetStatus: 'inactive'
    })).rejects.toThrow('CROSS_SCHOOL_STUDENT');
  });
});
