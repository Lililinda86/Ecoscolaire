import { describe, it, expect, vi, beforeEach } from 'vitest';
// Simple stub test pour l'interface de bulkAddSubjectsToClasses (frontend logic)
// L'interface étant en React sans Testing Library, nous testons ici la logique du service
// et les appels, le comportement du composant peut être testé manuellement ou en E2E.

import { bulkAddSubjectsToClasses } from '../../src/services/bulkClassSubjects';
import { httpsCallable } from 'firebase/functions';

vi.mock('firebase/app', () => ({
  getApp: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

describe('bulkAddSubjectsToClasses service', () => {
  let mockCallable: import('vitest').Mock;

  beforeEach(() => {
    mockCallable = vi.fn();
    (httpsCallable as unknown as import('vitest').Mock).mockReturnValue(mockCallable);
  });

  it('appelle la fonction callable avec le bon payload', async () => {
    const mockResult = {
      data: {
        classesProcessed: 2,
        totalSubjectsAdded: 3,
        totalDuplicatesIgnored: 1,
        details: [
          { classId: 'c1', status: 'success', added: 2, ignored: 0, error: null },
          { classId: 'c2', status: 'success', added: 1, ignored: 1, error: null }
        ]
      }
    };
    mockCallable.mockResolvedValueOnce(mockResult);

    const payload = {
      schoolId: 'sch1',
      academicYearId: '2026-2027',
      classIds: ['c1', 'c2'],
      subjectIds: ['s1', 's2']
    };

    const result = await bulkAddSubjectsToClasses(payload);

    expect(httpsCallable).toHaveBeenCalledWith(undefined, 'bulkAddSubjectsToClasses');
    expect(mockCallable).toHaveBeenCalledWith(payload);
    expect(result.classesProcessed).toBe(2);
    expect(result.totalSubjectsAdded).toBe(3);
  });

  it('propage les erreurs du backend', async () => {
    mockCallable.mockRejectedValueOnce(new Error('Backend error'));

    await expect(bulkAddSubjectsToClasses({
      schoolId: 'sch1',
      academicYearId: '2026-2027',
      classIds: ['c1'],
      subjectIds: ['s1']
    })).rejects.toThrow('Backend error');
  });
});
