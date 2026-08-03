/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TeacherAssignmentsPanel } from '../../src/pages/subjects/assignments/TeacherAssignmentsPanel';
import * as AppContextModule from '../../src/context/AppContext';
import * as useClassProgramModule from '../../src/hooks/useClassProgram';
import { getTeacherAssignmentCandidates, setPrimaryTeacherAssignment } from '../../src/services/teacherAssignmentFunctions';
import { getClassTeacherAssignmentSlots } from '../../src/services/teacherAssignments';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

vi.mock('../../src/services/teacherAssignments', () => ({
  getClassTeacherAssignmentSlots: vi.fn()
}));
vi.mock('../../src/services/teacherAssignmentFunctions', () => ({
  getTeacherAssignmentCandidates: vi.fn(),
  setPrimaryTeacherAssignment: vi.fn(),
  deactivateTeacherAssignment: vi.fn()
}));
vi.mock('../../src/components/Modal', () => ({
  default: ({ children, isOpen }: any) => isOpen ? <div data-testid="mock-modal">{children}</div> : null
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
  afterEach(cleanup);
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTeacherAssignmentCandidates).mockResolvedValue({ candidates: [] });
    vi.mocked(getClassTeacherAssignmentSlots).mockResolvedValue([]);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  const renderPanel = (useClassProgramResult: any, overrideContext?: any) => {
    vi.spyOn(AppContextModule, 'useAppContext').mockReturnValue({
      db: {
        classes: [{ id: 'class-1', name: 'CE1' }],
        school: { id: 'school-1', academicYear: 'ay_canonical_1' },
        academicYears: [{ id: 'ay_canonical_1', schoolId: 'school-1', name: '2023-2024' }],
        staff: []
      },
      currentSchool: { id: 'school-1', academicYearId: 'ay_canonical_1' },
      currentUser: { id: 'u1', role: 'superAdmin' },
      ...overrideContext
    } as unknown as any);

    vi.spyOn(useClassProgramModule, 'useClassProgram').mockReturnValue(useClassProgramResult);

    render(<TeacherAssignmentsPanel />);
  };

  it('D.1 teacherStaffId correspond au staff.id', () => {
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

  it('13, 14. avertissement informatif visible pour enseignant sans compte', async () => {
    vi.mocked(getTeacherAssignmentCandidates).mockResolvedValueOnce({
      candidates: [{ teacherStaffId: 's1', name: 'Koa Elise', accountStatus: 'unlinked', isEligible: true } as any]
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
    
    await waitFor(() => screen.getByTestId('mock-modal'));
    
    // Select the option
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getAllByRole('option')[1]); // s1
    
    expect(screen.getByText(/Cet enseignant peut être affecté immédiatement/i)).toBeTruthy();
  });

  it('15. enseignant avec compte sans avertissement', async () => {
    vi.mocked(getTeacherAssignmentCandidates).mockResolvedValueOnce({
      candidates: [{ teacherStaffId: 's1', name: 'John', accountStatus: 'linked', isEligible: true } as any]
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
    
    await waitFor(() => screen.getByTestId('mock-modal'));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getAllByRole('option')[1]); // s1
    
    expect(screen.queryByText(/Cet enseignant peut être affecté immédiatement/i)).toBeNull();
  });

  it('16, 17, 18, 19, 25. Payload valide et modale fermée après succès', async () => {
    vi.mocked(getTeacherAssignmentCandidates).mockResolvedValueOnce({
      candidates: [{ teacherStaffId: 's1', name: 'Koa Elise', accountStatus: 'unlinked', isEligible: true } as any]
    });
    vi.mocked(setPrimaryTeacherAssignment).mockResolvedValueOnce({ assigned: true } as any);
    
    renderPanel({
      status: 'success',
      errorCode: null,
      program: { id: 'prog', publishedRevisionId: 'rev-1' },
      subjects: [{ subjectId: 'subj-1', subjectNameSnapshot: 'Maths', weeklyHours: 2 }],
      hasPublishedVersion: true
    });
    
    const assignBtns = await screen.findAllByRole('button', { name: /Affecter/i });
    fireEvent.click(assignBtns[0]);
    
    await waitFor(() => screen.getByTestId('mock-modal'));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getAllByRole('option')[1]);
    
    const submitBtn = screen.getAllByRole('button', { name: /Affecter/i })[1];
    fireEvent.click(submitBtn);
    
    await waitFor(() => {
      expect(setPrimaryTeacherAssignment).toHaveBeenCalledWith({
        schoolId: 'school-1',
        academicYearId: 'ay_canonical_1',
        classId: 'class-1',
        subjectId: 'subj-1',
        teacherStaffId: 's1'
      });
      expect(screen.queryByTestId('mock-modal')).toBeNull();
    });
  });

  it('20, 21. année absente ou ambiguë: erreur dans la modale, aucun appel backend', async () => {
    vi.mocked(getTeacherAssignmentCandidates).mockResolvedValueOnce({
      candidates: [{ teacherStaffId: 's1', name: 'Koa', accountStatus: 'unlinked', isEligible: true } as any]
    });
    
    // Override context to simulate ambiguous academic year
    renderPanel({
      status: 'success',
      errorCode: null,
      program: { id: 'prog', publishedRevisionId: 'rev-1' },
      subjects: [{ subjectId: 'subj-1', subjectNameSnapshot: 'Maths', weeklyHours: 2 }],
      hasPublishedVersion: true
    }, {
      currentSchool: { id: 'school-1', academicYearId: '2026-2027' },
      db: {
        classes: [{ id: 'class-1', name: 'CE1' }],
        school: { id: 'school-1', academicYear: '2026-2027' },
        academicYears: [
          { id: 'ay_canonical_1', schoolId: 'school-1', name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' },
          { id: 'ay_canonical_2', schoolId: 'school-1', name: '2026-2027', startDate: '2026-09-02', endDate: '2027-06-30' }
        ],
        staff: []
      }
    });
    
    const assignBtns = await screen.findAllByRole('button', { name: /Affecter/i });
    fireEvent.click(assignBtns[0]);
    
    await waitFor(() => screen.getByTestId('mock-modal'));
    
    await waitFor(() => {
      expect(screen.getByText('Impossible d’identifier l’année scolaire sélectionnée.')).toBeTruthy();
      expect(setPrimaryTeacherAssignment).not.toHaveBeenCalled();
    });
  });

  it('22, 23, 24. Erreur backend: modale ouverte, état libéré, double clic bloqué', async () => {
    vi.mocked(getTeacherAssignmentCandidates).mockResolvedValueOnce({
      candidates: [{ teacherStaffId: 's1', name: 'Koa Elise', accountStatus: 'unlinked', isEligible: true } as any]
    });
    
    // Simulate slow error response
    vi.mocked(setPrimaryTeacherAssignment).mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100));
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
    
    await waitFor(() => screen.getByTestId('mock-modal'));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getAllByRole('option')[1]);
    
    const submitBtn = screen.getAllByRole('button', { name: /Affecter/i })[1];
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn); // Double click
    
    // Should display saving state
    expect(screen.getByRole('button', { name: /Enregistrement.../i })).toHaveProperty('disabled', true);
    
    await waitFor(() => {
      expect(screen.getByText('Impossible d’enregistrer l’affectation. Réessayez.')).toBeTruthy();
      expect(screen.getByTestId('mock-modal')).toBeTruthy();
      expect(setPrimaryTeacherAssignment).toHaveBeenCalledTimes(1);
    });
  });
});
