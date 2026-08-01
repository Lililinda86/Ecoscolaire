/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { ClassProgramPanel } from '../../src/pages/subjects/programs/ClassProgramPanel';
import { useAppContext } from '../../src/context/AppContext';

afterEach(cleanup);

vi.mock('../../src/context/AppContext', () => ({
  useAppContext: vi.fn()
}));

vi.mock('../../src/hooks/useClassProgram', () => ({
  useClassProgram: vi.fn()
}));
import { useClassProgram } from '../../src/hooks/useClassProgram';

vi.mock('../../src/utils/academicPermissions', () => ({
  canManageAcademicPrograms: vi.fn(() => true)
}));

vi.mock('../../src/pages/subjects/programs/ClassProgramSelectors', () => ({
  ClassProgramSelectors: ({ academicYearLabel, setSelectedClassId }: { academicYearLabel: string, setSelectedClassId: (id: string) => void }) => (
    <div data-testid="selectors">
      <span data-testid="year-label">{academicYearLabel}</span>
      <button data-testid="select-class" onClick={() => setSelectedClassId('class1')}>Select Class</button>
    </div>
  )
}));

vi.mock('../../src/pages/subjects/programs/ClassProgramTable', () => ({
  ClassProgramTable: ({ subjects }: { subjects: { id: string; name: string }[] }) => (
    <div data-testid="program-table">
      {subjects.map((s) => <div key={s.id} data-testid="subject-row">{s.name}</div>)}
    </div>
  )
}));

describe('ClassProgramPanel', () => {
  const mockDb = {
    school: { id: 'school1', academicYear: 'ay_legacy_1' },
    academicYears: [
      { id: 'ay_legacy_1', schoolId: 'school1', name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' },
      { id: 'ay_legacy_2', schoolId: 'school1', name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' },
      { id: 'ay_diff_1', schoolId: 'school2', name: '2026-2027' },
      { id: 'ay_ambig_1', schoolId: 'school1', name: '2027-2028', startDate: '2027-09-01', endDate: '2028-06-30' },
      { id: 'ay_ambig_2', schoolId: 'school1', name: '2027-2028', startDate: '2027-10-01', endDate: '2028-07-30' }
    ],
    classes: [
      { id: 'class1', name: 'CE1', schoolId: 'school1', type: 'francophone' }
    ]
  };

  const mockContext = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: mockDb as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentUser: { id: 'u1', role: 'director' } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentSchool: { id: 'school1' } as any,
    updateLocalState: vi.fn(),
    updateStudentLocal: vi.fn(),
    addStudentsLocal: vi.fn(),
    patchLocalEntities: vi.fn(),
    saveDB: vi.fn(),
    safeMergeDB: vi.fn(),
    safePatchDB: vi.fn(),
    saveStructuredGrades: vi.fn(),
    isSupervising: false,
    enterSupervision: vi.fn(),
    exitSupervision: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    isFirestoreConnected: true,
    firestoreError: null,
    lastSyncDate: new Date(),
    supervisionSchoolId: null,
    authLoading: false,
    logAuditAction: vi.fn(),
    isSchoolSuspended: false,
    createAcademicYear: vi.fn(),
    activateAcademicYear: vi.fn(),
    updateAcademicYearBounds: vi.fn(),
    createAcademicPeriod: vi.fn(),
    openAcademicPeriod: vi.fn(),
    closeAcademicPeriod: vi.fn(),
    publishAcademicPeriod: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppContext as Mock).mockReturnValue(mockContext);
  });

  const renderPanel = () => {
    return render(<ClassProgramPanel />);
  };

  it('transmits the true canonical academicYear.id to useClassProgram and the true name to selectors', () => {
    (useClassProgram as Mock).mockReturnValue({
      status: 'idle',
      source: 'none',
      program: null,
      subjects: []
    });

    renderPanel();

    expect(useClassProgram).toHaveBeenCalledWith(expect.objectContaining({
      academicYearId: 'ay_legacy_1',
      schoolId: 'school1'
    }));

    expect(screen.getByTestId('year-label').textContent).toContain('2026-2027');
  });

  it('does not make arbitrary choices for ambiguous years with contradicting dates', () => {
    const ambigContext = {
      ...mockContext,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: { ...mockDb, school: { id: 'school1', academicYear: 'ay_ambig_1' } } as any
    };
    (useAppContext as Mock).mockReturnValue(ambigContext);
    (useClassProgram as Mock).mockReturnValue({ status: 'idle' });

    render(<ClassProgramPanel />);

    expect(useClassProgram).toHaveBeenCalledWith(expect.objectContaining({
      academicYearId: 'ay_ambig_1'
    }));
  });

  it('displays legacy CE1 program with published status and 8 subjects', () => {
    const mockSubjects = Array.from({ length: 8 }).map((_, i) => ({ id: `sub${i}`, name: `Subject ${i}` }));

    (useClassProgram as Mock).mockReturnValue({
      status: 'success',
      source: 'published',
      program: { status: 'published' },
      subjects: mockSubjects,
      hasPublishedVersion: true
    });

    renderPanel();

    const button = screen.getByTestId('select-class');
    button.click();

    expect(screen.getByText('Publié')).not.toBeNull();

    const rows = screen.getAllByTestId('subject-row');
    expect(rows.length).toBe(8);

    expect(screen.queryByText('Créer le programme')).toBeNull();
  });

  it('excludes other schools during resolution', () => {
    renderPanel();
    expect(useClassProgram).toHaveBeenCalledWith(expect.objectContaining({
      schoolId: 'school1'
    }));
  });
});
