import { describe, it, expect } from 'vitest';
import { resolveClassProgram } from '../../src/services/classProgramResolver';
import type { ClassProgram } from '../../src/types';

describe('classProgramResolver', () => {
  const mockClassPrograms = [
    {
      id: 'legacy-id-123',
      schoolId: 'school-1',
      classId: 'class-1',
      academicYearId: 'ay_canonical_1',
      status: 'published',
      publishedRevisionId: 'rev-1',
      draftRevisionId: 'rev-1'
    },
    {
      id: 'draft-id-456',
      schoolId: 'school-1',
      classId: 'class-1',
      academicYearId: 'ay_canonical_1',
      status: 'draft',
      publishedRevisionId: null,
      draftRevisionId: 'rev-2'
    }
  ];

  it('resolves published program with legacy document ID but canonical academicYearId', () => {
    const result = resolveClassProgram({
      classPrograms: mockClassPrograms as unknown as ClassProgram[],
      schoolId: 'school-1',
      classId: 'class-1',
      academicYearIds: ['ay_canonical_1'],
      mode: 'published'
    });

    expect(result.status).toBe('success');
    expect(result.program?.id).toBe('legacy-id-123');
  });

  it('ignores draft programs', () => {
    const result = resolveClassProgram({
      classPrograms: mockClassPrograms as unknown as ClassProgram[],
      schoolId: 'school-1',
      classId: 'class-1',
      academicYearIds: ['ay_canonical_2'], // completely different
      mode: 'published'
    });

    expect(result.status).toBe('no_program');
    expect(result.program).toBeNull();
  });

  it('excludes other schools and classes', () => {
    const resultSchool = resolveClassProgram({
      classPrograms: mockClassPrograms as unknown as ClassProgram[],
      schoolId: 'school-2',
      classId: 'class-1',
      academicYearIds: ['ay_canonical_1'],
      mode: 'published'
    });
    expect(resultSchool.status).toBe('no_program');

    const resultClass = resolveClassProgram({
      classPrograms: mockClassPrograms as unknown as ClassProgram[],
      schoolId: 'school-1',
      classId: 'class-2',
      academicYearIds: ['ay_canonical_1'],
      mode: 'published'
    });
    expect(resultClass.status).toBe('no_program');
  });

  it('handles ambiguous published programs', () => {
    const ambiguousPrograms = [
      ...mockClassPrograms,
      {
        id: 'legacy-id-789',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: 'ay_canonical_1',
        status: 'published',
        publishedRevisionId: 'rev-3',
        draftRevisionId: 'rev-3'
      }
    ];

    const result = resolveClassProgram({
      classPrograms: ambiguousPrograms as unknown as ClassProgram[],
      schoolId: 'school-1',
      classId: 'class-1',
      academicYearIds: ['ay_canonical_1'],
      mode: 'published'
    });

    expect(result.status).toBe('ambiguous_program');
    expect(result.program).toBeNull();
  });
});
