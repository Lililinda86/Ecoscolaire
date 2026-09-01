import { runTransaction, type Firestore } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateStudentSeparatedData } from '../../src/services/studentPrivacy';

const transactionGet = vi.fn();
const transactionUpdate = vi.fn();
const transactionSet = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_firestore, collectionName: string, id: string) => `${collectionName}/${id}`),
  runTransaction: vi.fn(async (_firestore, callback) => callback({
    get: transactionGet,
    update: transactionUpdate,
    set: transactionSet
  })),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true }))
}));

beforeEach(() => {
  vi.clearAllMocks();
  transactionGet.mockResolvedValue({ exists: () => true });
});

describe('student separated finance persistence', () => {
  it.each([
    ['feeT1', 1100],
    ['feeT2', 2200],
    ['feeT3', 3300],
    ['financialBypass', { t1: true, t2: false, t3: false }]
  ] as const)('updates %s in finance and parent projection in one transaction', async (field, value) => {
    await updateStudentSeparatedData({
      firestore: {} as Firestore,
      studentId: 'student-1',
      schoolId: 'school-1',
      actorId: 'owner-1',
      patch: { [field]: value }
    });

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(transactionUpdate).toHaveBeenCalledWith(
      'studentFinance/student-1',
      expect.objectContaining({ [field]: value })
    );
    expect(transactionUpdate).toHaveBeenCalledWith(
      'studentParentFinance/student-1',
      expect.objectContaining({ [field]: value })
    );
  });

  it('propagates a projection write failure from the shared transaction', async () => {
    transactionUpdate.mockImplementation((reference: string) => {
      if (reference === 'studentParentFinance/student-1') throw new Error('projection write failed');
    });

    await expect(updateStudentSeparatedData({
      firestore: {} as Firestore,
      studentId: 'student-1',
      schoolId: 'school-1',
      actorId: 'owner-1',
      patch: { feeT1: 1100 }
    })).rejects.toThrow('projection write failed');
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it('creates missing private projections and never sends medical fields to students', async () => {
    transactionGet.mockImplementation(async (reference: string) => ({
      exists: () => ![
        'studentPrivate/student-1',
        'studentParentPrivate/student-1'
      ].includes(reference)
    }));

    await updateStudentSeparatedData({
      firestore: {} as Firestore,
      studentId: 'student-1',
      schoolId: 'school-1',
      actorId: 'owner-1',
      patch: {
        name: 'Élève privé',
        dob: '2018-01-02',
        allergies: 'Arachides',
        medicalConditions: 'Asthme'
      }
    });

    expect(transactionSet).toHaveBeenCalledWith(
      'studentPrivate/student-1',
      expect.objectContaining({ allergies: 'Arachides', medicalConditions: 'Asthme' })
    );
    expect(transactionSet).toHaveBeenCalledWith(
      'studentParentPrivate/student-1',
      expect.objectContaining({ dob: '2018-01-02' })
    );
    const publicWrites = transactionUpdate.mock.calls
      .filter(([reference]) => reference === 'students/student-1')
      .map(([, data]) => data as Record<string, unknown>);
    expect(publicWrites).toEqual([{ name: 'Élève privé' }]);
    expect(publicWrites.every(data => !('allergies' in data) && !('medicalConditions' in data))).toBe(true);
  });

  it('creates missing finance projections without a public financial fallback', async () => {
    transactionGet.mockImplementation(async (reference: string) => ({
      exists: () => ![
        'studentFinance/student-1',
        'studentParentFinance/student-1'
      ].includes(reference)
    }));

    await updateStudentSeparatedData({
      firestore: {} as Firestore,
      studentId: 'student-1',
      schoolId: 'school-1',
      actorId: 'owner-1',
      patch: { name: 'Élève legacy', feeT1: 1100, tuitionPaid: 500 }
    });

    expect(transactionSet).toHaveBeenCalledWith(
      'studentFinance/student-1',
      expect.objectContaining({ schoolId: 'school-1', studentId: 'student-1', feeT1: 1100, tuitionPaid: 500 })
    );
    expect(transactionSet).toHaveBeenCalledWith(
      'studentParentFinance/student-1',
      expect.objectContaining({ schoolId: 'school-1', studentId: 'student-1', feeT1: 1100 })
    );
    expect(transactionUpdate).toHaveBeenCalledWith('students/student-1', { name: 'Élève legacy' });
  });

  it('persists transport activation in students and studentPrivate without finance writes', async () => {
    await updateStudentSeparatedData({
      firestore: {} as Firestore,
      studentId: 'student-1',
      schoolId: 'school-1',
      actorId: 'secretary-1',
      patch: {
        usesTransport: true,
        transportStatus: 'active',
        transportZonePk: 28,
        transportNeighborhood: 'Quartier A',
        transportPickupPoint: 'Point A'
      }
    });

    expect(transactionUpdate).toHaveBeenCalledWith('students/student-1', {
      usesTransport: true,
      transportStatus: 'active'
    });
    expect(transactionUpdate).toHaveBeenCalledWith(
      'studentPrivate/student-1',
      expect.objectContaining({
        transportZonePk: 28,
        transportNeighborhood: 'Quartier A',
        transportPickupPoint: 'Point A'
      })
    );
    expect(transactionUpdate.mock.calls.some(([reference]) => reference === 'studentFinance/student-1')).toBe(false);
    expect(transactionUpdate.mock.calls.some(([reference]) => reference === 'studentParentFinance/student-1')).toBe(false);
  });

  it('replaces every edited transport value without retaining the old values', async () => {
    await updateStudentSeparatedData({
      firestore: {} as Firestore,
      studentId: 'student-1',
      schoolId: 'school-1',
      actorId: 'secretary-1',
      patch: {
        usesTransport: true,
        transportStatus: 'active',
        transportZonePk: 35,
        transportNeighborhood: 'Quartier B',
        transportPickupPoint: 'Point B'
      }
    });

    expect(transactionUpdate).toHaveBeenCalledWith(
      'studentPrivate/student-1',
      expect.objectContaining({
        transportZonePk: 35,
        transportNeighborhood: 'Quartier B',
        transportPickupPoint: 'Point B'
      })
    );
    expect(JSON.stringify(transactionUpdate.mock.calls)).not.toMatch(/Quartier A|Point A/);
  });

  it('securely creates a missing studentPrivate record during transport enrollment', async () => {
    transactionGet.mockImplementation(async (reference: string) => ({
      exists: () => reference !== 'studentPrivate/student-1'
    }));

    await updateStudentSeparatedData({
      firestore: {} as Firestore,
      studentId: 'student-1',
      schoolId: 'school-1',
      actorId: 'secretary-1',
      patch: {
        usesTransport: true,
        transportStatus: 'active',
        transportZonePk: 28,
        transportNeighborhood: 'Quartier A',
        transportPickupPoint: 'Point A'
      }
    });

    expect(transactionSet).toHaveBeenCalledWith(
      'studentPrivate/student-1',
      expect.objectContaining({
        id: 'student-1',
        studentId: 'student-1',
        schoolId: 'school-1',
        transportZonePk: 28,
        transportNeighborhood: 'Quartier A',
        transportPickupPoint: 'Point A'
      })
    );
  });

  it('deactivates transport while preserving existing private pickup history', async () => {
    await updateStudentSeparatedData({
      firestore: {} as Firestore,
      studentId: 'student-1',
      schoolId: 'school-1',
      actorId: 'secretary-1',
      patch: {
        usesTransport: false,
        transportStatus: 'none',
        transportZonePk: 28,
        transportNeighborhood: 'Quartier A',
        transportPickupPoint: 'Point A'
      }
    });

    expect(transactionUpdate).toHaveBeenCalledWith('students/student-1', {
      usesTransport: false,
      transportStatus: 'none'
    });
    expect(transactionUpdate).toHaveBeenCalledWith(
      'studentPrivate/student-1',
      expect.objectContaining({
        transportZonePk: 28,
        transportNeighborhood: 'Quartier A',
        transportPickupPoint: 'Point A'
      })
    );
  });

  it('removes only explicitly cleared private transport fields', async () => {
    await updateStudentSeparatedData({
      firestore: {} as Firestore,
      studentId: 'student-1',
      schoolId: 'school-1',
      actorId: 'secretary-1',
      patch: {
        transportZonePk: undefined,
        transportNeighborhood: '',
        transportPickupPoint: ''
      }
    });

    expect(transactionUpdate).toHaveBeenCalledWith(
      'studentPrivate/student-1',
      expect.objectContaining({
        transportZonePk: { __deleteField: true },
        transportNeighborhood: { __deleteField: true },
        transportPickupPoint: { __deleteField: true }
      })
    );
  });
});
