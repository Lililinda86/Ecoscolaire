/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/Modal', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => isOpen
    ? <div role="dialog">{children}</div>
    : null,
}));

vi.mock('../../src/context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

vi.mock('../../src/context/I18nContext', () => ({
  useI18n: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

import { useAppContext } from '../../src/context/AppContext';
import Grades from '../../src/pages/Grades';

describe('Grades empty-period contract', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('exposes the empty state and blocks grade/evaluation entry when no period is OPEN', () => {
    vi.mocked(useAppContext).mockReturnValue({
      currentUser: { uid: 'owner-1', role: 'owner', schoolId: 'school-1' },
      currentSchool: { id: 'school-1', activeAcademicYearId: 'year-1' },
      db: {
        academicYears: [{ id: 'year-1', schoolId: 'school-1', name: '2031-2032', status: 'active' }],
        periods: [],
        classPrograms: [{ id: 'program-1', schoolId: 'school-1', academicYearId: 'year-1', status: 'published' }],
        teacherAssignments: [{ id: 'assignment-1', schoolId: 'school-1', academicYearId: 'year-1', status: 'active', isActive: true }],
        classes: [],
        classSubjects: [],
        subjects: [],
        students: [],
        evaluations: [],
        grades: [],
      },
    } as never);

    render(<Grades />);

    const configurationRequired = screen.getByTestId('grades-configuration-required');
    expect(within(configurationRequired).getByText(/^Aucune période ouverte\.?$/i)).toBeTruthy();

    const gradeEntry = screen.getByRole('button', { name: /Saisir des Notes/i }) as HTMLButtonElement;
    expect(gradeEntry.disabled).toBe(true);
    fireEvent.click(gradeEntry);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});