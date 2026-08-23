/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassProgramEditor } from '../../src/pages/subjects/programs/editor/ClassProgramEditor';
import * as bulkService from '../../src/services/bulkClassSubjects';

vi.mock('../../src/services/bulkClassSubjects', () => ({ bulkAddSubjectsToClasses: vi.fn() }));
vi.mock('../../src/pages/subjects/programs/editor/ClassProgramSubjectPicker', () => ({
  ClassProgramSubjectPicker: ({ onBulkSelect }: { onBulkSelect: (classes: string[], subjects: string[]) => void }) => (
    <div>
      <button onClick={() => onBulkSelect(['c1'], ['s1'])}>Ajouter localement</button>
      <button onClick={() => onBulkSelect(['c1', 'c2'], ['s2'])}>Tentative multi-classe</button>
    </div>
  ),
}));

const props = {
  initialProgram: {
    id: 'p1', schoolId: 'school-1', academicYearId: 'ay-1', classId: 'c1', status: 'draft' as const,
    draftRevisionId: 'p1__v1', draftRevisionNumber: 1, hasUnpublishedChanges: true,
    createdAt: '2026-01-01', createdBy: 'u1', updatedAt: '2026-01-01', updatedBy: 'u1',
  },
  initialSubjects: [], schoolId: 'school-1', academicYearId: 'ay-1', classId: 'c1',
  userId: 'u1', userRole: 'owner',
  catalogSubjects: [
    { id: 's1', name: 'Mathématiques', schoolId: 'school-1', isActive: true },
    { id: 's2', name: 'Sciences', schoolId: 'school-1', isActive: true },
  ],
  classes: [{ id: 'c1', name: 'CE1', schoolId: 'school-1' }, { id: 'c2', name: 'CM1', schoolId: 'school-1' }],
  onClose: vi.fn(), onSaveSuccess: vi.fn(),
};

describe('ClassProgramEditor canonical class-scoped subject selection', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('adds to local draft state and never calls the retired bulk endpoint', async () => {
    const user = userEvent.setup();
    render(<ClassProgramEditor {...props} />);
    await user.click(screen.getByRole('button', { name: /Ajouter une matière/i }));
    await user.click(screen.getByRole('button', { name: 'Ajouter localement' }));
    expect(screen.getByText('Mathématiques')).not.toBeNull();
    expect(bulkService.bulkAddSubjectsToClasses).not.toHaveBeenCalled();
  });

  it('rejects a multi-class selection and hides mutation controls from secretary', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClassProgramEditor {...props} />);
    await user.click(screen.getByRole('button', { name: /Ajouter une matière/i }));
    await user.click(screen.getByRole('button', { name: 'Tentative multi-classe' }));
    expect(screen.queryByText('Sciences')).toBeNull();
    rerender(<ClassProgramEditor {...props} userRole="secretary" />);
    expect(screen.queryByRole('button', { name: /Ajouter une matière/i })).toBeNull();
  });
});
