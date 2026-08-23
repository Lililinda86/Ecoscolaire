import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAcademicYear,
  activateAcademicYear,
  createPeriod,
  openPeriod
} from '../../src/services/academicCalendarPersistence';
import type { AcademicYear, Period } from '../../src/types';

// Mock Firestore functions
const mockRunTransaction = vi.fn();
const mockWriteBatch = vi.fn();
const mockBatchCommit = vi.fn();
const mockBatchSet = vi.fn();
const mockCallable = vi.fn();

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => mockCallable)
}));

vi.mock('firebase/firestore', () => {
  return {
    doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}` })),
    collection: vi.fn((_db, path) => path),
    runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
    writeBatch: () => {
      mockWriteBatch();
      return { set: mockBatchSet, commit: mockBatchCommit };
    },
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn(() => ({ docs: [] }))
  };
});

describe('academicCalendarPersistence', () => {
  const currentSchoolId = 'school-1';
  const firestore = {} as import('firebase/firestore').Firestore;
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAcademicYear', () => {
    it('throws if schoolId does not match currentSchoolId', async () => {
      const payload = { schoolId: 'other-school' } as AcademicYear;
      await expect(createAcademicYear(firestore, currentSchoolId, payload)).rejects.toThrow();
    });

    it('returns canonical result for simple creation', async () => {
      const payload = { id: 'ay1', schoolId: currentSchoolId, version: 0 } as AcademicYear;
      mockRunTransaction.mockImplementation(async (_db, callback) => callback({
        get: vi.fn().mockResolvedValue({ exists: () => false }),
        set: vi.fn()
      }));
      const result = await createAcademicYear(firestore, currentSchoolId, payload, false);
      expect(mockRunTransaction).toHaveBeenCalled();
      expect(result.createdYear).toBeDefined();
      expect(result.createdYear.version).toBe(1);
      expect(result.activatedYear).toBeNull();
      expect(result.closedYear).toBeNull();
    });

    it('returns canonical result for immediate activation', async () => {
      const payload = { id: 'ay2', schoolId: currentSchoolId, updatedAt: 'now', updatedBy: 'user1' } as AcademicYear;
      mockRunTransaction.mockImplementation(async (db, callback) => {
        const transaction = {
          get: vi.fn().mockResolvedValue({
            exists: () => true,
            data: () => ({ id: 'school-1', activeAcademicYearId: 'ay1', version: 1 })
          }),
          set: vi.fn(),
          update: vi.fn()
        };
        // Provide old year mock too
        transaction.get.mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ id: 'school-1', activeAcademicYearId: 'ay1', version: 1 })
        }).mockResolvedValueOnce({
          exists: () => false,
          data: () => undefined
        }).mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ id: 'ay1', status: 'active', version: 1 })
        });
        
        return callback(transaction);
      });

      const result = await createAcademicYear(firestore, currentSchoolId, payload, true);
      expect(mockRunTransaction).toHaveBeenCalled();
      expect(result.createdYear.status).toBe('active');
      expect(result.activatedYear?.id).toBe('ay2');
      expect(result.closedYear?.status).toBe('closed');
      expect(result.closedYear?.version).toBe(2);
      expect(result.updatedSchool?.activeAcademicYearId).toBe('ay2');
    });
  });

  describe('activateAcademicYear', () => {
    it('returns canonical result and closes old year', async () => {
      mockRunTransaction.mockImplementation(async (db, callback) => {
        const transaction = {
          get: vi.fn().mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ id: 'school-1', activeAcademicYearId: 'ay1', version: 1 })
          }).mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ id: 'ay2', schoolId: currentSchoolId, status: 'draft', version: 1 })
          }).mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ id: 'ay1', status: 'active', version: 1 })
          }),
          update: vi.fn()
        };
        return callback(transaction);
      });

      const result = await activateAcademicYear(firestore, currentSchoolId, 'ay2', 'user-1');
      expect(result.activeAcademicYearId).toBe('ay2');
      expect(result.activatedYear.status).toBe('active');
      expect(result.closedYear?.id).toBe('ay1');
      expect(result.closedYear?.status).toBe('closed');
      expect(result.updatedSchool?.version).toBe(2);
    });

    it('rejects if target is archived', async () => {
      mockRunTransaction.mockImplementation(async (db, callback) => {
        const transaction = {
          get: vi.fn().mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ id: 'school-1', activeAcademicYearId: null })
          }).mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ id: 'ay2', schoolId: currentSchoolId, status: 'archived' })
          }),
          update: vi.fn()
        };
        return callback(transaction);
      });

      await expect(activateAcademicYear(firestore, currentSchoolId, 'ay2', 'user-1')).rejects.toThrow();
    });
  });

  describe('createPeriod', () => {
    it('returns canonical result including updated academic year', async () => {
      const period = { id: 'server-p1', schoolId: currentSchoolId, academicYearId: 'ay1', status: 'draft', version: 1 } as Period;
      mockCallable.mockResolvedValue({ data: { success: true, period, academicYear: { id: 'ay1' } } });
      const payload = { ...period, id: 'client-id', name: 'P1', type: 'term', order: 1, startDate: '2026-09-01', endDate: '2026-12-01' } as Period;
      const result = await createPeriod(firestore, currentSchoolId, payload);
      expect(result.createdPeriod.version).toBe(1);
      expect(result.createdPeriod.id).toBe('server-p1');
      expect(mockCallable).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', academicYearId: 'ay1' }));
    });
  });

  describe('openPeriod', () => {
    it('returns the single opened period without closing another one implicitly', async () => {
      const period = { id: 'p2', schoolId: currentSchoolId, academicYearId: 'ay1', status: 'open', version: 2 } as Period;
      mockCallable.mockResolvedValue({ data: { success: true, period, academicYear: { id: 'ay1', openPeriodId: 'p2' } } });
      const result = await openPeriod(firestore, currentSchoolId, 'ay1', 'p2', 'user-1');
      expect(result.openPeriodId).toBe('p2');
      expect(result.openedPeriod.status).toBe('open');
      expect(result.updatedAcademicYear.openPeriodId).toBe('p2');
      expect(mockCallable).toHaveBeenCalledWith(expect.objectContaining({ action: 'OPEN', periodId: 'p2' }));
    });
  });
});
