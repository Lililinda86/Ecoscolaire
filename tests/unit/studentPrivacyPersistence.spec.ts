import { runTransaction, type Firestore } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateStudentSeparatedData } from '../../src/services/studentPrivacy';

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
});
