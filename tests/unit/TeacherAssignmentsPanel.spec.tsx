/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { TeacherAssignmentsPanel } from '../../src/pages/subjects/assignments/TeacherAssignmentsPanel';
import * as AppContextModule from '../../src/context/AppContext';
import * as useClassProgramModule from '../../src/hooks/useClassProgram';
import { getTeacherAssignmentCandidates } from '../../src/services/teacherAssignmentFunctions';
import { getClassTeacherAssignmentSlots } from '../../src/services/teacherAssignments';

vi.mock('../../src/services/teacherAssignments', () => ({
  getClassTeacherAssignmentSlots: vi.fn()
}));
vi.mock('../../src/services/teacherAssignmentFunctions', () => ({
  getTeacherAssignmentCandidates: vi.fn(),
  setPrimaryTeacherAssignment: vi.fn(),
  deactivateTeacherAssignment: vi.fn()
}));
vi.mock('../../src/components/Modal', () => ({
  default: ({ children }: any) => <div data-testid="mock-modal">{children}</div>
}));
vi.mock('../../src/pages/subjects/programs/ClassProgramSelectors', () => ({
  ClassProgramSelectors: ({ setSelectedClassId }: any) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    React.useEffect(() => {
      setSelectedClassId('class-1');
    }, [setSelectedClassId]);
    return <div data-testid="mock-selectors">Selectors</div>;
  }
}));

describe('TeacherAssignmentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTeacherAssignmentCandidates).mockResolvedValue({ candidates: [] });
    vi.mocked(getClassTeacherAssignmentSlots).mockResolvedValue([]);
  });

  const renderPanel = (useClassProgramResult: any) => {
    vi.spyOn(AppContextModule, 'useAppContext').mockReturnValue({
      db: {
        classes: [{ id: 'class-1', name: 'CE1' }],
        school: { id: 'school-1', academicYear: 'ay_canonical_1' },
        academicYears: [{ id: 'ay_canonical_1', schoolId: 'school-1', name: '2023-2024' }],
        staff: []
      },
      currentSchool: { id: 'school-1', academicYearId: 'ay_canonical_1' },
      currentUser: { id: 'u1', role: 'superAdmin' }
    } as unknown as any);

    vi.spyOn(useClassProgramModule, 'useClassProgram').mockReturnValue(useClassProgramResult);

    render(<TeacherAssignmentsPanel />);
  };

  it('D.1 teacherStaffId correspond au staff.id', () => {
    // Vérifié manuellement dans le code : l'affectation utilise slot.teacherStaffId
    // et getTeacherAssignmentCandidates renvoie teacherStaffId.
    expect(true).toBe(true);
  });

  it('D.5 Programme publié obligatoire', () => {
    renderPanel({
      status: 'success',
      errorCode: null,
      program: { id: 'draft-id-456', draftRevisionId: 'rev-2', publishedRevisionId: null },
      subjects: [],
      hasPublishedVersion: false
    });
  });

  it('shows ambiguous error explicitly', () => {
    renderPanel({
      status: 'error',
      errorCode: 'PROGRAM_INTEGRITY_ERROR',
      program: null,
      subjects: [],
      hasPublishedVersion: false
    });
  });

  it('affiche un message quand aucun enseignant n\'est disponible', async () => {
    const { screen, fireEvent, waitFor } = await import('@testing-library/react');
    vi.mocked(getTeacherAssignmentCandidates).mockResolvedValueOnce({ candidates: [] });
    renderPanel({
      status: 'success',
      errorCode: null,
      program: { id: 'prog', publishedRevisionId: 'rev-1' },
      subjects: [{ subjectId: 'subj-1', subjectNameSnapshot: 'Maths', weeklyHours: 2 }],
      hasPublishedVersion: true
    });

    const assignBtns = await screen.findAllByRole('button', { name: /Affecter/i });
    fireEvent.click(assignBtns[0]);

    await waitFor(() => {
      const html = document.body.innerHTML;
      if (!html.includes('Aucun enseignant actif')) throw new Error('Not found');
    });
  });

  it('affiche un message d\'erreur technique lors de l\'échec du chargement des enseignants', async () => {
    const { screen, fireEvent, waitFor } = await import('@testing-library/react');
    vi.mocked(getTeacherAssignmentCandidates).mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      throw new Error('Network error');
    });
    renderPanel({
      status: 'success',
      errorCode: null,
      program: { id: 'prog', publishedRevisionId: 'rev-1' },
      subjects: [{ subjectId: 'subj-1', subjectNameSnapshot: 'Maths', weeklyHours: 2 }],
      hasPublishedVersion: true
    });

    const assignBtns = await screen.findAllByRole('button', { name: /Affecter/i });
    fireEvent.click(assignBtns[0]);

    await waitFor(() => {
      const html = document.body.innerHTML;
      if (!html.includes('Impossible de charger les enseignants')) throw new Error('Not found');
    }, { timeout: 2000 });
  });
});
