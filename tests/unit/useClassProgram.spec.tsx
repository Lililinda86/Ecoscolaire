/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useClassProgram } from '../../src/hooks/useClassProgram';
import * as AppContextModule from '../../src/context/AppContext';
import type { ClassProgram } from '../../src/types';

vi.mock('../../src/services/classPrograms', () => ({
  getClassSubjectsByRevision: vi.fn().mockResolvedValue([]),
  ClassProgramServiceError: class ClassProgramServiceError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
}));

describe('useClassProgram', () => {
  const mockClassPrograms: ClassProgram[] = [
    {
      id: 'legacy-id-123',
      schoolId: 'school-1',
      classId: 'class-1',
      academicYearId: 'ay_canonical_1',
      status: 'published',
      publishedRevisionId: 'rev-1',
      draftRevisionId: 'rev-1'
    } as ClassProgram
  ];

  it('returns legacy program successfully without throwing PROGRAM_INTEGRITY_ERROR', async () => {
    vi.spyOn(AppContextModule, 'useAppContext').mockReturnValue({
      db: {
        classPrograms: mockClassPrograms,
        academicYears: [
          { id: 'ay_canonical_1', name: '2026-2027', startDate: '', endDate: '', isArchived: false, schoolId: 'school-1' }
        ]
      },
      currentUser: { id: 'u1', role: 'superAdmin' },
      currentSchool: { id: 'school-1' }
    } as unknown as any);

    const { result } = renderHook(() =>
      useClassProgram({
        schoolId: 'school-1',
        academicYearId: 'ay_canonical_1',
        selectedClass: { id: 'class-1' } as unknown as any,
        currentRole: 'superAdmin',
        requestedView: 'published'
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    expect(result.current.errorCode).toBeNull();
    expect(result.current.program?.id).toBe('legacy-id-123'); // real ID preserved
  });
});
