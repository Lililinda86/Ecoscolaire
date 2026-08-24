/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as AppContext from '../../src/context/AppContext';
import { TeacherAssignmentsPanel } from '../../src/pages/subjects/assignments/TeacherAssignmentsPanel';
import { getSchoolTeacherAssignments } from '../../src/services/teacherAssignments';
import { getTeacherAssignmentCandidates, manageTeacherAssignment } from '../../src/services/teacherAssignmentFunctions';

vi.mock('../../src/services/teacherAssignments', () => ({ getSchoolTeacherAssignments: vi.fn() }));
vi.mock('../../src/services/teacherAssignmentFunctions', () => ({ getTeacherAssignmentCandidates: vi.fn(), manageTeacherAssignment: vi.fn() }));
vi.mock('../../src/components/Modal', () => ({ default: ({ isOpen, children }: any) => isOpen ? <div data-testid="modal">{children}</div> : null }));

const assignment = { id: 'school-1__year-1__class-1__subject-1__staff-1', schoolId: 'school-1', academicYearId: 'year-1', classId: 'class-1', subjectId: 'subject-1', teacherStaffId: 'staff-1', status: 'draft', isActive: false, version: 1, createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' } as const;
const context = (role = 'owner') => ({
  currentUser: { id: 'user-1', role },
  db: {
    school: { id: 'school-1', activeAcademicYearId: 'year-1', academicYear: '2026-2027' },
    academicYears: [{ id: 'year-1', schoolId: 'school-1', name: '2026-2027', status: 'active' }],
    classes: [{ id: 'class-1', schoolId: 'school-1', name: 'CE1', active: true }],
    subjects: [{ id: 'subject-1', schoolId: 'school-1', name: 'Mathématiques', isActive: true }],
    staff: [{ id: 'staff-1', schoolId: 'school-1', name: 'Mme Koa' }],
    classPrograms: [], classSubjects: [],
  },
} as any);

describe('TeacherAssignmentsPanel canonical lifecycle', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AppContext, 'useAppContext').mockReturnValue(context());
    vi.mocked(getSchoolTeacherAssignments).mockResolvedValue([assignment as any]);
    vi.mocked(getTeacherAssignmentCandidates).mockResolvedValue({ candidates: [{ teacherStaffId: 'staff-1', name: 'Mme Koa', isEligible: true, accountStatus: 'unlinked' }] });
    vi.mocked(manageTeacherAssignment).mockResolvedValue({ success: true, changed: true, assignment: {} });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('lists and filters every canonical dimension, and explains missing Programs', async () => {
    render(<TeacherAssignmentsPanel />);
    expect((await screen.findAllByText('Mme Koa')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Année scolaire')).toBeTruthy();
    expect(screen.getByLabelText('Classe')).toBeTruthy();
    expect(screen.getByLabelText('Enseignant')).toBeTruthy();
    expect(screen.getByLabelText('Matière')).toBeTruthy();
    expect(screen.getByLabelText('Statut')).toBeTruthy();
    expect(screen.getByText('PROGRAMME NON PUBLIÉ')).toBeTruthy();
  });

  it('creates and edits DRAFT without requiring a period or a published program', async () => {
    render(<TeacherAssignmentsPanel />);
    await screen.findAllByText('Mme Koa');
    fireEvent.change(screen.getByLabelText('Classe'), { target: { value: 'class-1' } });
    fireEvent.change(screen.getByLabelText('Matière'), { target: { value: 'subject-1' } });
    fireEvent.change(screen.getByLabelText('Enseignant'), { target: { value: 'staff-1' } });
    fireEvent.click(await screen.findByRole('button', { name: /Créer un brouillon/i }));
    expect(screen.getByText(/Sans programme publié, le brouillon reste possible/i)).toBeTruthy();
    fireEvent.change(screen.getAllByLabelText('Année scolaire').at(-1)!, { target: { value: 'year-1' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer DRAFT' }).closest('form')!);
    await waitFor(() => expect(manageTeacherAssignment).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE_DRAFT', academicYearId: 'year-1', classId: 'class-1', subjectId: 'subject-1', teacherStaffId: 'staff-1' })));
  });

  it.each([360, 768, 1440])('renders the complete workflow at %ipx', async width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    render(<TeacherAssignmentsPanel />);
    expect(await screen.findByText('Affectations enseignants')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activer' })).toBeTruthy();
  });

  it('secretary can prepare drafts but cannot activate them', async () => {
    vi.spyOn(AppContext, 'useAppContext').mockReturnValue(context('secretary'));
    render(<TeacherAssignmentsPanel />);
    expect(await screen.findByRole('button', { name: /Créer un brouillon/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Activer' })).toBeNull();
  });
});
